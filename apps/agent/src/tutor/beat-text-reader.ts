import { BEAT_LIMITS, type Beat, type BoardKinds, getBoardAfter, getBoardProblem, LIVE_MESSAGE_MAX_BYTES, parseSceneCommand, type SceneCommand } from '@astra/contracts';

/** A turn wraps up at the next clause past this, because T4 gives a spoken turn 20 seconds. */
export const TURN_WORDS_TO_WRAP = 50;
/** B2 gives a turn's first drawing 1 s from its first word, which is about three words. */
const DRAWING_GUARD_WORD = 3;
const FEWEST_WORDS_BEFORE_A_COMMA = 4;
/** The first words start the voice, so they go out sooner, at the cost of a short phrase. */
const FEWEST_WORDS_BEFORE_THE_FIRST_COMMA = 2;
const LONGEST_TAG_CHARACTERS = 200;

const UNSPEAKABLE = /[\u0000*_`~#[\]$\\^️​-‏‪-‮⁠-⁩﻿\uD800-\uDFFF]|\p{Extended_Pictographic}/u;
const JSON_SYMBOL = /[\s{}[\]:,\d.+-]/;
const JSON_WORDS = ['true', 'false', 'null'];
const LETTER = /[a-zA-Z]/;
const JSON_MARKS = /[":]/;
const ENDS_IN_QUESTION = /\?["')]*\s*$/;
const ENDS_IN_SENTENCE = /[.!]["')]*\s*$/;
const ENDS_IN_CLAUSE = /[,;:]\s*$/;
const STILL_A_TAG = /^<\/?(?:[A-Za-z_][\w:.-]*(?:\s[^<>\n]*)?)?$/;
const TAG_NAME = /^<(\/?)([A-Za-z_][\w:.-]*)/;
/** What is inside these is the model's own working, so none of it may reach the voice. */
const PRIVATE_TAGS: ReadonlySet<string> = new Set(['thinking', 'think', 'reasoning', 'scratchpad', 'analysis', 'reflection', 'function_calls', 'invoke', 'parameter', 'system', 'system-reminder']);

export interface WrittenBeatParts {
  script: Beat['script'];
  wordCount: number;
  expectsReply: boolean;
}

export type CommandVerdict = { ok: true } | { ok: false; problem: string; isWrongMath: boolean };

export interface BeatTextReaderOptions {
  onBeatEnd(beat: WrittenBeatParts): void;
  onBadCommand(problem: string): void;
  /** The command stated math that code found false, so the words after it must not be spoken. */
  onWrongMath(problem: string): void;
  onCommandKept?(command: SceneCommand): void;
  /** Checks what the scene language cannot see, such as whether the math is true. */
  checkCommand?(command: SceneCommand): CommandVerdict;
  board?: BoardKinds;
  /** On by default. Off only where a test needs to see each command it wrote and no other. */
  hasDrawingGuard?: boolean;
}

const isPrivateTag = (name: string) => PRIVATE_TAGS.has(name.toLowerCase()) || name.toLowerCase().startsWith('antml:');

// Reads a model's stream character by character into beats, so speech goes to the voice and a command goes to the board, in order.
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
  #wordsThisTurn = 0;
  #hasCommandThisTurn = false;
  #isHalted = false;
  #isTurnOver = false;
  #textAfterTurn = '';
  #script: Beat['script'] = [];
  #waitingCues: SceneCommand[] = [];
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
    return this.#isTurnOver;
  }

  get textAfterTurn(): string {
    return this.#textAfterTurn;
  }

  get wordsThisTurn(): number {
    return this.#wordsThisTurn;
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
    for (const _ of this.#waitingCues) this.#options.onBadCommand('no word followed the command');
    this.#waitingCues = [];
  }

  /** Closes what was read so far when a new request will carry on from it, with nothing half read left over. */
  closeAttempt(): void {
    this.#brokenTail = null;
    this.#command = null;
    this.#tag = null;
    this.#privateTag = null;
    this.#held = '';
    this.#isHalted = false;
    this.#endBeat();
  }

  #startBeat(): void {
    this.#script = [];
    this.#waitingCues = [];
    this.#createdIds = new Set();
    this.#wordCount = 0;
    this.#characterCount = 0;
    this.#commandCount = 0;
    this.#isAfterSpace = true;
    this.#text = '';
  }

  #step(character: string): void {
    if (this.#isHalted) return;
    if (this.#isTurnOver) this.#textAfterTurn += character;
    else if (this.#brokenTail !== null) this.#stepInBrokenTail(character);
    else if (this.#command !== null) this.#stepInCommand(character);
    else if (this.#tag !== null) this.#stepInTag(character);
    else if (this.#privateTag !== null) this.#stepInPrivateTag(character);
    else this.#stepInSpeech(character);
  }

  #stepInSpeech(character: string): void {
    if (this.#held !== '') this.#stepAfterOpenBrace(character);
    else if (character === '{') this.#held = character;
    else if (character === '<') this.#tag = character;
    else if (character === '\n') this.#endBeat();
    else if (character !== '}' && !UNSPEAKABLE.test(character)) this.#speak(character);
  }

  // A tag is held back until it closes, because "x < 5" must still be spoken.
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
    for (const character of held) {
      if (character !== '<') this.#stepInSpeech(character);
    }
  }

  #stepInPrivateTag(character: string): void {
    this.#held += character;
    if (character !== '>') return;
    const closing = `</${this.#privateTag}>`;
    if (this.#held.toLowerCase().endsWith(closing.toLowerCase())) this.#privateTag = null;
    this.#held = '';
  }

  // A brace, any spaces, then a quote starts a command, and otherwise the brace is dropped.
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

  // A cue waits here for the next character, because only that says which word it belongs to.
  #speak(character: string): void {
    const isSpace = /\s/.test(character);
    if (this.#characterCount === BEAT_LIMITS.characters) {
      if (isSpace) return;
      this.#endBeat();
    }
    if (!isSpace && this.#isAfterSpace && this.#wordCount === BEAT_LIMITS.words) this.#endBeat();
    if (this.#isTurnOver) {
      this.#textAfterTurn += character;
      return;
    }
    if (!isSpace) this.#startOrContinueWord();
    this.#isAfterSpace = isSpace;
    this.#text += character;
    this.#characterCount += 1;
    this.#addToScript(character);
    if (isSpace && this.#isAtBeatBoundary()) this.#endBeat();
  }

  #startOrContinueWord(): void {
    const startsWord = this.#isAfterSpace;
    if (startsWord && this.#wordsThisTurn + 1 === DRAWING_GUARD_WORD && !this.#hasCommandThisTurn && this.#options.hasDrawingGuard !== false) this.#addDrawingGuard();
    this.#clearWaitingCues();
    if (startsWord) {
      this.#wordCount += 1;
      this.#wordsThisTurn += 1;
    }
  }

  // Short beats start the voice sooner, and M3.2 found commas and sentence ends are where a flush sounds natural.
  #isAtBeatBoundary(): boolean {
    if (this.#waitingCues.length > 0) return false;
    if (ENDS_IN_QUESTION.test(this.#text) || ENDS_IN_SENTENCE.test(this.#text)) return true;
    const isFirstBeat = this.#wordsThisTurn === this.#wordCount;
    return ENDS_IN_CLAUSE.test(this.#text) && this.#wordCount >= (isFirstBeat ? FEWEST_WORDS_BEFORE_THE_FIRST_COMMA : FEWEST_WORDS_BEFORE_A_COMMA);
  }

  #addToScript(text: string): void {
    const last = this.#script.at(-1);
    if (typeof last === 'string') this.#script[this.#script.length - 1] = last + text;
    else this.#script.push(text);
  }

  #clearWaitingCues(): void {
    this.#waitingCues = [];
  }

  // The turn has a board but no drawing yet, so the tutor points at what is already there.
  #addDrawingGuard(): void {
    const lastElement = [...this.#board.keys()].at(-1);
    if (lastElement === undefined) return;
    const parsed = parseSceneCommand({ kind: 'focus', target: lastElement });
    if (parsed.ok) this.#keepCommand(parsed.value);
  }

  // JSON allows a newline between its parts, and a string cannot hold one, so there it means the string never closes.
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

  // A newline or new brace makes the tail speech. So does a closing brace, unless the tail is one word or still looks like JSON.
  #stepInBrokenTail(character: string): void {
    if (character === '}') {
      const tail = this.#brokenTail as string;
      this.#brokenTail = null;
      this.#refuseCommand('the command is not JSON');
      if (/\s\S/.test(tail.trim()) && !JSON_MARKS.test(tail)) for (const spoken of tail) this.#stepInSpeech(spoken);
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
    const text = this.#command as string;
    this.#command = null;
    if (this.#isCommandTooLong) {
      this.#isCommandTooLong = false;
      this.#options.onBadCommand('the command is too long');
      return;
    }
    const value = this.#readJson(text);
    if (value === undefined) return;
    const parsed = parseSceneCommand(value);
    if (parsed.ok) this.#keepCommand(parsed.value);
    else this.#options.onBadCommand(parsed.problem);
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
    this.#waitingCues.push(command);
    this.#options.onCommandKept?.(command);
  }

  #refuseCommand(problem: string): void {
    this.#options.onBadCommand(this.#isCommandTooLong ? 'the command is too long' : problem);
    this.#isCommandTooLong = false;
    this.#command = null;
  }

  // A line with no words does not end a beat, and its commands wait for the next word.
  #endBeat(): void {
    if (this.#wordCount === 0) return;
    this.#clearWaitingCues();
    const expectsReply = ENDS_IN_QUESTION.test(this.#text);
    this.#options.onBeatEnd({ script: this.#script, wordCount: this.#wordCount, expectsReply });
    this.#isTurnOver = expectsReply || this.#wordsThisTurn >= TURN_WORDS_TO_WRAP;
    this.#startBeat();
  }
}
