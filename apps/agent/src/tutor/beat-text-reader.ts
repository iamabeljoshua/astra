import { BEAT_LIMITS, type Beat, type BoardKinds, getBoardAfter, getBoardProblem, LIVE_MESSAGE_MAX_BYTES, MATH_CLAIMS, parseSceneCommand, type SceneCommand } from '@astra/contracts';
import { type AttemptReport, parseAttemptReport } from './attempts.ts';
import { parseToolCall, type ToolCall } from './tools/tool-call.ts';

/** A turn wraps up at the next sentence end past this, which is Abel's limit, and the prompt asks for far fewer. */
export const TURN_WORDS_TO_WRAP = 45;
/** A stretch of speech takes a breath at the next sentence end past this, because long stretches are what sound like a machine. */
const STRETCH_WORDS_TO_BREATHE = 25;
/** A stretch breathes at its next beat past this even with no sentence end in sight, because Abel's limit is 45 words and a long sentence must not pass it. */
const STRETCH_WORDS_TO_BREATHE_AT_ANY_BEAT = 35;
/** A stretch with no comma or sentence end still gets its breath here, so no words but a safety reply's pass the limit. */
const MOST_WORDS_IN_A_STRETCH = 42;
/** A line break after fewer words than this is only a new beat, because a pause after "Okay, look." sounds odd. */
const FEWEST_WORDS_BEFORE_A_BREATH = 6;
/** A sentence that never ends stops here, so a run-on cannot speak for a minute. */
const TURN_WORDS_TO_CUT = 90;
const WORDS_FOR_A_LATE_TASK = 'Over to you.';
/** B2 gives a turn's first drawing 1 s from its first word, which is about three words. */
const DRAWING_GUARD_WORD = 3;
const FEWEST_WORDS_BEFORE_A_COMMA = 4;
/** A beat is what the voice receives and flushes at once. "Fine." flushed alone holds about twice the time before the next word that it does in a phrase, 574 ms against 272, so a shorter piece joins the words after it. */
const FEWEST_WORDS_IN_A_BEAT = 3;
const LONGEST_TAG_CHARACTERS = 200;
/** A long run of combining marks can crash a Chrome tab when a caption draws it. */
const MOST_MARKS_IN_A_ROW = 4;

const UNSPEAKABLE = /[*_`~#[\]$\\^]|\p{Cc}|\p{Cf}|\p{Cs}|\p{Co}|\p{Variation_Selector}|\p{Extended_Pictographic}/u;
const JSON_SYMBOL = /[\s{}[\]:,\d.+-]/;
const JSON_WORDS = ['true', 'false', 'null'];
const LETTER = /[a-zA-Z]/;
const JSON_MARKS = /[":]/;
const ENDS_IN_QUESTION = /\?["')]*\s*$/;
const ENDS_IN_SENTENCE = /[.!]["')]*\s*$/;
const ENDS_IN_CLAUSE = /[,;:]\s*$/;
const ENDS_IN_ABBREVIATION = /(?:^|[\s("'])(?:mr|mrs|ms|dr|prof|st|vs|(?:[a-z]\.)+[a-z])\.["')]*\s*$/i;
const ENDS_IN_ELLIPSIS = /\.{2,}["')]*\s*$/;
/** A sentence can end inside a beat, when the words after a comma were too few to stand alone. */
const HOLDS_SENTENCE_END = /[a-z][.!]["')]*\s+\S/i;
/** Words only a safety reply uses, so that reply is never paused, wrapped, or ended at a question. Help must reach the student whole. A lesson can say the second group too, so those count only inside a question. */
const SAFETY_REPLY = /\b(?:that sounds[^.?!]*serious|right thing telling me|adult you trust|trusted adult|(?:your|local) emergency (?:number|services)|are you safe)\b|\b(?:feel safe|in danger|hurting yourself|hurt yourself|ending your life|not your fault)\b[^.?!]*\?/i;
export const NAMES_HELP = /\b(?:adult|emergency)\b/i;

/** A false match costs only a line of chat, so this leans toward counting a lesson that says "adult". */
export const isAboutSafety = (words: string) => SAFETY_REPLY.test(words) || NAMES_HELP.test(words);
const STILL_A_TAG = /^<\/?(?:[A-Za-z_][\w:.-]*(?:\s[^<>\n]*)?)?$/;
const TAG_NAME = /^<(\/?)([A-Za-z_][\w:.-]*)/;
const PRIVATE_TAGS: ReadonlySet<string> = new Set(['thinking', 'think', 'reasoning', 'scratchpad', 'analysis', 'reflection', 'function_calls', 'invoke', 'parameter', 'system', 'system-reminder']);

export interface WrittenBeatParts {
  script: Beat['script'];
  wordCount: number;
  expectsReply: boolean;
  /** This beat starts a new stretch of speech, so the student hears a breath before it. */
  startsStretch: boolean;
}

export type CommandVerdict = { ok: true } | { ok: false; problem: string; isWrongMath: boolean };

export interface BeatTextReaderOptions {
  onBeatEnd(beat: WrittenBeatParts): void;
  onBadCommand(problem: string): void;
  onWrongMath(problem: string): void;
  onCommandKept?(command: SceneCommand): void;
  /** A command already kept never reached the student. */
  onCommandDropped?(command: SceneCommand): void;
  /** The reply stops here, and carries on from the same words once the tool has answered. */
  onToolCall?(call: ToolCall): void;
  onAttemptReport?(report: AttemptReport): void;
  checkCommand?(command: SceneCommand): CommandVerdict;
  checkWords?(text: string): string | null;
  onWrongWords?(problem: string): void;
  /** A retry that says these words again would repeat what the student heard, so they are dropped. */
  isAlreadySaid?(text: string): boolean;
  board?: BoardKinds;
}

const looksLikeSpeech = (tail: string) => /\s\S/.test(tail.trim()) && !JSON_MARKS.test(tail);

const isSentenceEnd = (text: string) => ENDS_IN_SENTENCE.test(text) && !ENDS_IN_ABBREVIATION.test(text) && !ENDS_IN_ELLIPSIS.test(text);

// A model can invent a word for what a line is. It is still some other relation, which code does not judge, and losing the line would be worse.
function withKnownClaim(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('claim' in value)) return value;
  const { claim, ...command } = value as { claim: unknown; kind?: unknown };
  if (command.kind !== 'writeMath' && command.kind !== 'transformMath') return command;
  return { ...command, claim: MATH_CLAIMS.includes(claim as (typeof MATH_CLAIMS)[number]) ? claim : 'relation' };
}

const isPrivateTag = (name: string) => PRIVATE_TAGS.has(name.toLowerCase()) || name.toLowerCase().startsWith('antml:');

export class BeatTextReader {
  #options: BeatTextReaderOptions;
  #board: BoardKinds;
  #held = '';
  #tag: string | null = null;
  #privateTag: string | null = null;
  #command: string | null = null;
  #depth = 0;
  #isInString = false;
  #isEscaped = false;
  #jsonWord = '';
  #brokenTail: string | null = null;
  #isCommandTooLong = false;
  #marksInARow = 0;
  #wordsThisTurn = 0;
  #wordsThisStretch = 0;
  #isBreathDue = false;
  #startsStretch = false;
  #didLastBeatEndSentence = false;
  #isSafetyReply = false;
  #hasCommandThisTurn = false;
  #isHalted = false;
  #isTurnOver = false;
  #isQuestionHeld = false;
  #keptAfterQuestion: string[] = [];
  #wasCutShort = false;
  #textAfterTurn = '';
  #script: Beat['script'] = [];
  #cuesAwaitingWord: SceneCommand[] = [];
  #createdIds = new Set<string>();
  #wordCount = 0;
  #characterCount = 0;
  #commandCount = 0;
  #isAfterSpace = true;
  #text = '';

  constructor(options: BeatTextReaderOptions) {
    this.#options = options;
    this.#board = options.board ?? new Map();
  }

  get isTurnOver(): boolean {
    return this.#isTurnOver || this.#isQuestionHeld;
  }

  /** The turn stopped at the word limit with a sentence still open, so the student has heard no ending. */
  get wasCutShort(): boolean {
    return this.#wasCutShort;
  }

  get textAfterTurn(): string {
    return this.#textAfterTurn;
  }

  /** The model's text as the student got it, without the words dropped after its question. */
  getKeptText(raw: string): string {
    if (this.#textAfterTurn === '') return raw;
    const questionEnd = Math.max(0, raw.length - this.#textAfterTurn.length - this.#keptAfterQuestion.join('').length);
    return [raw.slice(0, questionEnd), ...this.#keptAfterQuestion].join(' ');
  }

  get wordsThisTurn(): number {
    return this.#wordsThisTurn;
  }

  get isSafetyReply(): boolean {
    return this.#isSafetyReply || SAFETY_REPLY.test(this.#text);
  }

  push(fragment: string): void {
    for (const character of fragment) this.#step(character);
  }

  finish(): void {
    if (this.#brokenTail !== null) this.#releaseBrokenTail();
    if (this.#command !== null) this.#refuseCommand('the command never closed');
    if (this.#tag !== null) this.#releaseTag();
    this.#held = '';
    this.#endBeat();
    this.#landLateCommands();
  }

  // Beats end at a full stop, so a task written after the last sentence has no word left, and a few plain words carry it. Anything else late is dropped, and so is a task after help in a crisis, so the brain's board stays true.
  #landLateCommands(): void {
    const late = this.#cuesAwaitingWord;
    if (late.length === 0) return;
    if (late.some((command) => command.kind === 'task') && this.#wordsThisTurn > 0 && !this.#isSafetyReply) {
      this.push(WORDS_FOR_A_LATE_TASK);
      this.#endBeat();
      return;
    }
    this.#cuesAwaitingWord = [];
    for (const command of late) {
      this.#options.onCommandDropped?.(command);
      this.#options.onBadCommand('no word followed the command');
    }
  }

  /** A question was held back rather than spoken, so the turn it ended goes on. */
  reopenTurn(): void {
    this.#isTurnOver = false;
    this.#textAfterTurn = '';
  }

  /** Drops half-read commands and half a sentence, because the next request carries on from the words already said, and half a sentence is what a dropped stream must never speak. */
  closeAttempt(): void {
    this.#clearHalfRead();
    if (isSentenceEnd(this.#text) || ENDS_IN_QUESTION.test(this.#text)) this.#endBeat();
    else this.#dropWordsKeepingCommands();
  }

  /** Throws away what has not been spoken yet, because a refused reply's partial output must not be used. */
  dropAttempt(): void {
    this.#clearHalfRead();
    this.#startBeat();
  }

  #clearHalfRead(): void {
    this.#brokenTail = null;
    this.#command = null;
    this.#tag = null;
    this.#privateTag = null;
    this.#held = '';
    this.#isHalted = false;
  }

  #dropWordsKeepingCommands(): void {
    const commands = this.#script.filter((part) => typeof part !== 'string');
    const createdIds = this.#createdIds;
    const commandCount = this.#commandCount;
    const startsStretch = this.#startsStretch;
    this.#wordsThisTurn -= this.#wordCount;
    this.#wordsThisStretch -= this.#wordCount;
    this.#startBeat();
    this.#script = commands;
    this.#cuesAwaitingWord = [...commands] as SceneCommand[];
    this.#createdIds = createdIds;
    this.#commandCount = commandCount;
    this.#startsStretch = startsStretch;
  }

  #startBeat(): void {
    this.#startsStretch = false;
    this.#script = [];
    this.#cuesAwaitingWord = [];
    this.#createdIds = new Set();
    this.#wordCount = 0;
    this.#characterCount = 0;
    this.#commandCount = 0;
    this.#isAfterSpace = true;
    this.#text = '';
  }

  #step(character: string): void {
    if (this.#isHalted) return;
    if (this.#isTurnOver) this.#addAfterTurn(character);
    else if (this.#brokenTail !== null) this.#stepInBrokenTail(character);
    else if (this.#command !== null) this.#stepInCommand(character);
    else if (this.#tag !== null) this.#stepInTag(character);
    else if (this.#privateTag !== null) this.#stepInPrivateTag(character);
    else this.#stepInSpeech(character);
  }

  // A question or a word limit ended the turn, and help written after it must still be spoken.
  #addAfterTurn(character: string): void {
    this.#textAfterTurn += character;
    if (!SAFETY_REPLY.test(this.#textAfterTurn)) return;
    const held = this.#textAfterTurn;
    this.#textAfterTurn = '';
    this.#isTurnOver = false;
    this.#wasCutShort = false;
    this.#isSafetyReply = true;
    this.push(held);
  }

  // Help written after a held question must be spoken too, so it lets the question go.
  #addAfterHeldQuestion(character: string): void {
    this.#textAfterTurn += character;
    if (!SAFETY_REPLY.test(this.#textAfterTurn)) return;
    const held = this.#textAfterTurn;
    this.#textAfterTurn = '';
    this.#isQuestionHeld = false;
    this.#isSafetyReply = true;
    this.push(held);
  }

  #isPastWordCut(): boolean {
    return this.#wordsThisTurn >= TURN_WORDS_TO_CUT && !this.#isSafetyReply;
  }

  #isOneMarkTooMany(character: string): boolean {
    this.#marksInARow = /\p{M}/u.test(character) ? this.#marksInARow + 1 : 0;
    return this.#marksInARow > MOST_MARKS_IN_A_ROW;
  }

  #stepInSpeech(character: string): void {
    if (this.#held !== '') this.#stepAfterOpenBrace(character);
    else if (character === '{') this.#held = character;
    else if (character === '<') this.#tag = character;
    else if (character === '\n' && this.#isQuestionHeld) this.#addAfterHeldQuestion(character);
    else if (character === '\n') this.#endLineOrHoldQuestion();
    else if (character !== '}' && !UNSPEAKABLE.test(character) && !this.#isOneMarkTooMany(character)) this.#speak(character);
  }

  // Held until it closes, because "x < 5" must still be spoken with its sign.
  #stepInTag(character: string): void {
    const tag = `${this.#tag}${character}`;
    if (character === '>' && TAG_NAME.test(tag)) {
      this.#tag = null;
      const [, closing, name] = TAG_NAME.exec(tag) as RegExpExecArray;
      if (closing === '' && isPrivateTag(name as string)) this.#privateTag = name as string;
      this.#options.onBadCommand(`an internal tag, ${name}, was dropped`);
    } else if (STILL_A_TAG.test(tag) && tag.length <= LONGEST_TAG_CHARACTERS) {
      this.#tag = tag;
    } else {
      this.#tag = tag;
      this.#releaseTag();
    }
  }

  #releaseTag(): void {
    const held = this.#tag ?? '';
    this.#tag = null;
    this.#speak('<');
    for (const character of held.slice(1)) this.#stepInSpeech(character);
  }

  #stepInPrivateTag(character: string): void {
    this.#held += character;
    if (character !== '>') return;
    const closing = `</${this.#privateTag}>`;
    if (this.#held.toLowerCase().endsWith(closing.toLowerCase())) this.#privateTag = null;
    this.#held = '';
  }

  #stepAfterOpenBrace(character: string): void {
    if (character === '"') {
      this.#command = `${this.#held}"`;
      this.#depth = 1;
      this.#isInString = true;
      this.#isEscaped = false;
      this.#jsonWord = '';
      this.#held = '';
    } else if (/\s/.test(character)) {
      this.#held += character;
    } else {
      const spaces = this.#held.slice(1);
      this.#held = '';
      for (const heldCharacter of `${spaces}${character}`) this.#stepInSpeech(heldCharacter);
    }
  }

  // The model writes a line break between ideas, and one that falls mid sentence is only a new beat.
  #endLine(): void {
    const isQuestion = ENDS_IN_QUESTION.test(this.#text);
    const isTooShortForABeat = this.#wordCount < FEWEST_WORDS_IN_A_BEAT && !isQuestion;
    if (this.#wordCount > 0 && (isTooShortForABeat || (isQuestion && this.isSafetyReply))) {
      if (!this.#isAfterSpace) this.#speak(' ');
      return;
    }
    this.#endBeat();
    if (this.#didLastBeatEndSentence && this.#wordsThisStretch >= FEWEST_WORDS_BEFORE_A_BREATH && !this.#isSafetyReply) this.#isBreathDue = true;
  }

  #speak(character: string): void {
    const isSpace = /\s/.test(character);
    if (this.#isQuestionHeld) return this.#addAfterHeldQuestion(character);
    if (this.#characterCount === BEAT_LIMITS.characters) {
      if (isSpace) return;
      this.#endBeat();
    }
    if (!isSpace && this.#isAfterSpace && (this.#wordCount === BEAT_LIMITS.words || this.#isPastWordCut() || this.#isStretchFull())) this.#endBeat();
    if (this.#isTurnOver) return this.#addAfterTurn(character);
    if (!isSpace) this.#startOrContinueWord();
    this.#isAfterSpace = isSpace;
    this.#text += character;
    this.#characterCount += 1;
    this.#addToScript(character);
    if (isSpace && this.#isAtBeatBoundary()) this.#endBeatOrHoldQuestion();
  }

  #endBeatOrHoldQuestion(): void {
    if (this.#wordCount > 0 && ENDS_IN_QUESTION.test(this.#text) && !this.isSafetyReply) this.#isQuestionHeld = true;
    else this.#endBeat();
  }

  #endLineOrHoldQuestion(): void {
    if (this.#wordCount > 0 && ENDS_IN_QUESTION.test(this.#text) && !this.isSafetyReply) this.#isQuestionHeld = true;
    else this.#endLine();
  }

  #startOrContinueWord(): void {
    const startsWord = this.#isAfterSpace;
    if (startsWord && this.#wordsThisTurn + 1 === DRAWING_GUARD_WORD && !this.#hasCommandThisTurn) this.#addDrawingGuard();
    this.#clearCuesAwaitingWord();
    if (startsWord) {
      if (this.#isBreathDue) {
        this.#isBreathDue = false;
        this.#startsStretch = true;
        this.#wordsThisStretch = 0;
      }
      this.#wordCount += 1;
      this.#wordsThisTurn += 1;
      this.#wordsThisStretch += 1;
    }
  }

  // Beats end at commas and sentence ends, because M3.2 measured mid-sentence flushes stretching the line.
  #isAtBeatBoundary(): boolean {
    if (this.#cuesAwaitingWord.length > 0) return false;
    // In a safety reply a question stays in its beat until more words or the end of the reply, so a student's "yes" cannot cut off the help after it.
    if (ENDS_IN_QUESTION.test(this.#text)) return !this.isSafetyReply;
    if (this.#wordCount < FEWEST_WORDS_IN_A_BEAT) return false;
    if (isSentenceEnd(this.#text)) return true;
    const isFirstBeat = this.#wordsThisTurn === this.#wordCount;
    return ENDS_IN_CLAUSE.test(this.#text) && this.#wordCount >= (isFirstBeat ? FEWEST_WORDS_IN_A_BEAT : FEWEST_WORDS_BEFORE_A_COMMA);
  }

  #addToScript(text: string): void {
    const last = this.#script.at(-1);
    if (typeof last === 'string') this.#script[this.#script.length - 1] = last + text;
    else this.#script.push(text);
  }

  #clearCuesAwaitingWord(): void {
    this.#cuesAwaitingWord = [];
  }

  #addDrawingGuard(): void {
    const lastElement = [...this.#board.keys()].at(-1);
    if (lastElement === undefined) return;
    const parsed = parseSceneCommand({ kind: 'focus', target: lastElement });
    if (parsed.ok) this.#keepCommand(parsed.value);
  }

  // A JSON string cannot hold a raw newline, so here it means the string never closed.
  #stepInCommand(character: string): void {
    if (!this.#isInString) {
      this.#stepInJson(character);
    } else if (character === '\n') {
      this.#refuseCommand('the command never closed');
      this.#endBeat();
    } else {
      this.#stepInString(character);
    }
  }

  #addToCommand(character: string): void {
    if ((this.#command as string).length < LIVE_MESSAGE_MAX_BYTES) this.#command += character;
    else this.#isCommandTooLong = true;
  }

  #stepInString(character: string): void {
    this.#addToCommand(character);
    if (this.#isEscaped) this.#isEscaped = false;
    else if (character === '\\') this.#isEscaped = true;
    else if (character === '"') this.#isInString = false;
  }

  #stepInJson(character: string): void {
    const wordBefore = this.#jsonWord;
    if (!this.#isStillJson(character)) {
      this.#brokenTail = LETTER.test(character) ? this.#jsonWord : `${wordBefore}${character}`;
      this.#jsonWord = '';
      return;
    }
    this.#addToCommand(character);
    if (character === '"') this.#isInString = true;
    if (character === '{') this.#depth += 1;
    if (character === '}') this.#depth -= 1;
    if (this.#depth === 0) this.#finishCommand();
  }

  // A bare word in JSON can only become true, false, or null, unless it is the e of a number.
  #isStillJson(character: string): boolean {
    if (LETTER.test(character)) {
      if (this.#jsonWord === '' && /[eE]/.test(character) && /\d$/.test(this.#command as string)) return true;
      this.#jsonWord += character;
      return JSON_WORDS.some((word) => word.startsWith(this.#jsonWord));
    }
    const isWordDone = this.#jsonWord === '' || JSON_WORDS.includes(this.#jsonWord);
    this.#jsonWord = '';
    return isWordDone && (character === '"' || JSON_SYMBOL.test(character));
  }

  #stepInBrokenTail(character: string): void {
    if (character === '}') {
      const tail = this.#brokenTail as string;
      this.#brokenTail = null;
      this.#refuseCommand('the command is not JSON');
      if (looksLikeSpeech(tail)) for (const spoken of tail) this.#stepInSpeech(spoken);
    } else if (character === '\n' || character === '{') {
      this.#releaseBrokenTail();
      this.#step(character);
    } else {
      this.#brokenTail += character;
    }
  }

  #releaseBrokenTail(): void {
    const tail = this.#brokenTail as string;
    this.#brokenTail = null;
    this.#refuseCommand('the command never closed');
    for (const character of tail) this.#stepInSpeech(character);
  }

  #finishCommand(): void {
    // NFD Vietnamese, Yoruba, and Igbo are refused by the math parser, and the same words in NFC set, and a stream can split a letter from its mark.
    const text = (this.#command as string).normalize('NFC');
    if (this.#isQuestionHeld) this.#keptAfterQuestion.push(text);
    this.#command = null;
    if (this.#isCommandTooLong) {
      this.#isCommandTooLong = false;
      this.#options.onBadCommand('the command is too long');
      return;
    }
    const value = this.#readJson(text);
    if (value === undefined || this.#takeTutorCall(value)) return;
    const parsed = parseSceneCommand(withKnownClaim(value));
    if (parsed.ok) this.#keepCommand(parsed.value);
    else this.#options.onBadCommand(parsed.problem);
  }

  // These go to code and never to the board, so a tool or a report can draw nothing.
  #takeTutorCall(value: unknown): boolean {
    const report = parseAttemptReport(value);
    if (report !== null) {
      this.#options.onAttemptReport?.(report);
      return true;
    }
    const parsedCall = parseToolCall(value);
    if (parsedCall === null) return false;
    if (!parsedCall.ok) {
      this.#options.onBadCommand(parsedCall.problem);
      return true;
    }
    this.#isHalted = true;
    this.#options.onToolCall?.(parsedCall.call);
    return true;
  }

  #readJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch (error) {
      this.#options.onBadCommand((error as Error).message);
      return undefined;
    }
  }

  #getCommandProblem(command: SceneCommand): string | null {
    const boardProblem = getBoardProblem(command, this.#board);
    if (boardProblem !== null) return boardProblem;
    if (this.#commandCount === BEAT_LIMITS.commands) return 'too many commands in one beat';
    return 'id' in command && this.#createdIds.has(command.id) ? 'id already created in this beat' : null;
  }

  #keepCommand(command: SceneCommand): void {
    const problem = this.#getCommandProblem(command);
    if (problem !== null) return this.#options.onBadCommand(problem);
    const verdict = this.#options.checkCommand?.(command) ?? { ok: true };
    if (!verdict.ok && verdict.isWrongMath) {
      this.#isHalted = true;
      return this.#options.onWrongMath(verdict.problem);
    }
    if (!verdict.ok) return this.#options.onBadCommand(verdict.problem);
    this.#commandCount += 1;
    this.#hasCommandThisTurn = true;
    if ('id' in command) this.#createdIds.add(command.id);
    this.#board = getBoardAfter(command, this.#board);
    this.#script.push(command);
    this.#cuesAwaitingWord.push(command);
    this.#options.onCommandKept?.(command);
  }

  #refuseCommand(problem: string): void {
    this.#options.onBadCommand(this.#isCommandTooLong ? 'the command is too long' : problem);
    this.#isCommandTooLong = false;
    this.#command = null;
  }

  #isStretchFull(): boolean {
    return !this.#isSafetyReply && this.#wordsThisStretch >= MOST_WORDS_IN_A_STRETCH;
  }

  #isStretchLongEnough(endsSentence: boolean): boolean {
    if (this.#wordsThisStretch >= STRETCH_WORDS_TO_BREATHE_AT_ANY_BEAT) return true;
    return this.#wordsThisStretch >= STRETCH_WORDS_TO_BREATHE && (endsSentence || HOLDS_SENTENCE_END.test(this.#text));
  }

  #endBeat(): void {
    if (this.#wordCount === 0) return;
    if (this.#options.isAlreadySaid?.(this.#text)) return this.#dropWordsKeepingCommands();
    this.#clearCuesAwaitingWord();
    this.#isQuestionHeld = false;
    const wordsProblem = this.#options.checkWords?.(this.#text) ?? null;
    if (wordsProblem !== null) {
      this.#isHalted = true;
      this.#startBeat();
      return this.#options.onWrongWords?.(wordsProblem);
    }
    const expectsReply = ENDS_IN_QUESTION.test(this.#text);
    const endsSentence = isSentenceEnd(this.#text);
    const script = this.#script.map((part) => (typeof part === 'string' ? part.normalize('NFC') : part));
    this.#isSafetyReply ||= SAFETY_REPLY.test(this.#text);
    this.#options.onBeatEnd({ script, wordCount: this.#wordCount, expectsReply, startsStretch: this.#startsStretch });
    const isAtCut = this.#isPastWordCut();
    this.#isTurnOver = (expectsReply && !this.#isSafetyReply) || (endsSentence && this.#wordsThisTurn >= TURN_WORDS_TO_WRAP && !this.#isSafetyReply) || isAtCut;
    this.#wasCutShort = isAtCut && !expectsReply && !endsSentence;
    this.#didLastBeatEndSentence = endsSentence || expectsReply;
    if (this.#isStretchLongEnough(endsSentence) && !this.#isSafetyReply) this.#isBreathDue = true;
    this.#startBeat();
  }
}
