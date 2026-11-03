// Speech goes to the voice, and a command goes to the board.
import { BEAT_LIMITS, getBoardAfter, getBoardProblem, LIVE_MESSAGE_MAX_BYTES, parseSceneCommand } from '../../../packages/contracts/src/index.ts';

const FIRST_FLUSH_AFTER_WORDS = 8;
const UNSPEAKABLE = /[\u0000*_`~#[\]\uFE0F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\uD800-\uDFFF]|\p{Extended_Pictographic}/u;
const JSON_SYMBOL = /[\s{}[\]:,\d.+-]/;
const JSON_WORDS = ['true', 'false', 'null'];
const LETTER = /[a-zA-Z]/;
const JSON_MARKS = /[":]/;

export class BeatTextReader {
  held = '';
  words = '';
  command = null;
  depth = 0;
  isInString = false;
  isEscaped = false;
  jsonWord = '';
  brokenTail = null;
  isCommandTooLong = false;
  hasFlushedFirstWords = false;
  hasUnflushedWords = false;
  wordsThisTurn = 0;
  isTurnOver = false;
  textAfterQuestion = '';

  constructor({ onText, onFlush, onCommand, onBadCommand, onBeatEnd, board = new Map() }) {
    Object.assign(this, { onText, onFlush, onCommand, onBadCommand, onBeatEnd, board });
    this.startBeat();
  }

  startBeat() {
    this.script = [];
    this.waitingCues = [];
    this.createdIds = new Set();
    this.wordCount = 0;
    this.characterCount = 0;
    this.commandCount = 0;
    this.isAfterSpace = true;
    this.text = '';
  }

  push(fragment) {
    for (const character of fragment) this.step(character);
  }

  step(character) {
    if (this.isTurnOver) this.textAfterQuestion += character;
    else if (this.brokenTail !== null) this.stepInBrokenTail(character);
    else if (this.command !== null) this.stepInCommand(character);
    else this.stepInSpeech(character);
  }

  finish() {
    if (this.brokenTail !== null) this.releaseBrokenTail();
    if (this.command !== null) this.refuseCommand('the command never closed');
    this.held = '';
    this.endBeat();
    for (const _ of this.waitingCues) this.onBadCommand('no word followed the command');
  }

  stepInSpeech(character) {
    if (this.held !== '') {
      this.stepAfterOpenBrace(character);
    } else if (character === '{') {
      this.held = character;
    } else if (character === '\n') {
      this.endBeat();
    } else if (character !== '}' && !UNSPEAKABLE.test(character)) {
      this.speak(character);
    }
  }

  // A brace, any spaces, then a quote starts a command, and otherwise the brace is dropped.
  stepAfterOpenBrace(character) {
    if (character === '"') {
      this.flushVoice('command');
      Object.assign(this, { command: `${this.held}"`, depth: 1, isInString: true, isEscaped: false, jsonWord: '', held: '' });
    } else if (/\s/.test(character)) {
      this.held += character;
    } else {
      const spaces = this.held.slice(1);
      this.held = '';
      for (const heldCharacter of `${spaces}${character}`) this.stepInSpeech(heldCharacter);
    }
  }

  // A cue waits here for the next character, because only that says which word it belongs to.
  speak(character) {
    const isSpace = /\s/.test(character);
    if (this.characterCount === BEAT_LIMITS.characters) {
      if (isSpace) return;
      this.endBeat();
    }
    if (!isSpace) {
      if (this.isAfterSpace && this.wordCount === BEAT_LIMITS.words) this.endBeat();
      this.fireWaitingCues(this.isAfterSpace ? this.wordCount : this.wordCount - 1);
      if (this.isAfterSpace) {
        this.wordCount += 1;
        this.wordsThisTurn += 1;
      }
    }
    this.isAfterSpace = isSpace;
    this.words += character;
    this.text += character;
    this.characterCount += 1;
    this.addToScript(character);
    if (!isSpace) return;
    this.sendWordsToVoice();
    if (!this.hasFlushedFirstWords && this.wordsThisTurn >= FIRST_FLUSH_AFTER_WORDS) this.flushVoice('firstWords');
  }

  addToScript(text) {
    if (typeof this.script.at(-1) === 'string') this.script[this.script.length - 1] += text;
    else this.script.push(text);
  }

  fireWaitingCues(atWord) {
    for (const command of this.waitingCues) this.onCommand(command, atWord);
    this.waitingCues = [];
  }

  // JSON allows a newline between its parts, and a string cannot hold one, so there it means the string never closes.
  stepInCommand(character) {
    if (!this.isInString) {
      this.stepInJson(character);
    } else if (character === '\n') {
      this.refuseCommand('the command never closed');
      this.endBeat();
    } else {
      this.stepInString(character);
    }
  }

  addToCommand(character) {
    if (this.command.length < LIVE_MESSAGE_MAX_BYTES) this.command += character;
    else this.isCommandTooLong = true;
  }

  stepInString(character) {
    this.addToCommand(character);
    if (this.isEscaped) this.isEscaped = false;
    else if (character === '\\') this.isEscaped = true;
    else if (character === '"') this.isInString = false;
  }

  stepInJson(character) {
    const wordBefore = this.jsonWord;
    if (!this.isStillJson(character)) {
      this.brokenTail = LETTER.test(character) ? this.jsonWord : `${wordBefore}${character}`;
      this.jsonWord = '';
      return;
    }
    this.addToCommand(character);
    if (character === '"') this.isInString = true;
    if (character === '{') this.depth += 1;
    if (character === '}') this.depth -= 1;
    if (this.depth === 0) this.finishCommand();
  }

  // A bare word in JSON can only become true, false, or null, unless it is the e of a number.
  isStillJson(character) {
    if (LETTER.test(character)) {
      if (this.jsonWord === '' && /[eE]/.test(character) && /\d$/.test(this.command)) return true;
      this.jsonWord += character;
      return JSON_WORDS.some((word) => word.startsWith(this.jsonWord));
    }
    const isWordDone = this.jsonWord === '' || JSON_WORDS.includes(this.jsonWord);
    this.jsonWord = '';
    return isWordDone && (character === '"' || JSON_SYMBOL.test(character));
  }

  // A newline or new brace makes the tail speech. So does a closing brace, unless the tail is one word or still looks like JSON.
  stepInBrokenTail(character) {
    if (character === '}') {
      const tail = this.brokenTail;
      this.brokenTail = null;
      this.refuseCommand('the command is not JSON');
      if (/\s\S/.test(tail.trim()) && !JSON_MARKS.test(tail)) for (const spoken of tail) this.stepInSpeech(spoken);
    } else if (character === '\n' || character === '{') {
      this.releaseBrokenTail();
      this.step(character);
    } else {
      this.brokenTail += character;
    }
  }

  releaseBrokenTail() {
    const tail = this.brokenTail;
    this.brokenTail = null;
    this.refuseCommand('the command never closed');
    for (const character of tail) this.stepInSpeech(character);
  }

  finishCommand() {
    const text = this.command;
    this.command = null;
    if (this.isCommandTooLong) {
      this.isCommandTooLong = false;
      this.onBadCommand('the command is too long');
      return;
    }
    let value;
    try {
      value = JSON.parse(text);
    } catch (error) {
      this.onBadCommand(error.message);
      return;
    }
    const parsed = parseSceneCommand(value);
    if (parsed.ok) this.keepCommand(parsed.value);
    else this.onBadCommand(parsed.problem);
  }

  keepCommand(command) {
    const boardProblem = getBoardProblem(command, this.board);
    if (boardProblem !== null) {
      this.onBadCommand(boardProblem);
    } else if (this.commandCount === BEAT_LIMITS.commands) {
      this.onBadCommand('too many commands in one beat');
    } else if (command.id !== undefined && this.createdIds.has(command.id)) {
      this.onBadCommand('id already created in this beat');
    } else {
      this.commandCount += 1;
      if (command.id !== undefined) this.createdIds.add(command.id);
      this.board = getBoardAfter(command, this.board);
      this.script.push(command);
      this.waitingCues.push(command);
    }
  }

  refuseCommand(problem) {
    this.onBadCommand(this.isCommandTooLong ? 'the command is too long' : problem);
    this.isCommandTooLong = false;
    this.command = null;
  }

  sendWordsToVoice() {
    if (this.words === '') return;
    this.onText(this.words);
    this.words = '';
    this.hasUnflushedWords = true;
  }

  flushVoice(reason) {
    if (!this.hasUnflushedWords) return;
    this.hasUnflushedWords = false;
    if (this.wordsThisTurn >= FIRST_FLUSH_AFTER_WORDS) this.hasFlushedFirstWords = true;
    this.onFlush(reason);
  }

  // A line with no words does not end a beat, and its commands wait for the next word.
  endBeat() {
    this.sendWordsToVoice();
    if (this.wordCount === 0) return;
    this.fireWaitingCues(this.wordCount - 1);
    if (!this.isAfterSpace) this.onText(' ');
    this.flushVoice('beatEnd');
    const expectsReply = /\?["')]*\s*$/.test(this.text);
    this.onBeatEnd({ script: this.script, wordCount: this.wordCount, expectsReply });
    this.isTurnOver = expectsReply;
    this.startBeat();
  }
}
