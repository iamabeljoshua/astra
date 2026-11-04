import { BEAT_LIMITS } from './beat.ts';
import { readBeatId, readTurnId } from './ids.ts';
import { type AgentMessage, type BrowserMessage, type BrowserStamp, clipTypedText, LIVE_MESSAGE_MAX_BYTES, STUDENT_WORDS_MAX_CHARACTERS, type TimedWord, TUTOR_CLOSED_REASONS } from './live-message.ts';
import { readSceneCommand } from './parse-command.ts';
import { PLAY_REPORT_KEYS, readFrozenFrames, readPlayReport, readStudentAction, readStudentWork } from './parse-event.ts';
import {
  type CheckedFields,
  checkJsonSize,
  fail,
  type ParseResult,
  type Place,
  readBoolean,
  readFields,
  readList,
  readOneOf,
  readString,
  readVariant,
  readWholeNumber,
  toParseResult,
  type VariantTable,
} from './read.ts';

const SHORTEST_AUDIO_GAP_MS = 1;

function readAudioGapMs(place: Place): number {
  const ms = readWholeNumber(place);
  if (ms < SHORTEST_AUDIO_GAP_MS) fail(place, `a whole number of ${SHORTEST_AUDIO_GAP_MS} or more`);
  return ms;
}

function readTimedWord(place: Place): TimedWord {
  const fields = readFields(place, ['text', 'startMs']);
  return { text: readString(fields.at('text'), BEAT_LIMITS.characters), startMs: readWholeNumber(fields.at('startMs')) };
}

const AGENT_MESSAGES: VariantTable<AgentMessage, 'type'> = {
  tag: 'type',
  variants: {
    turnStarted: {
      keys: ['turnId'],
      read: (fields) => ({ type: 'turnStarted', turnId: readTurnId(fields.at('turnId')) }),
    },
    cue: {
      keys: ['turnId', 'beatId', 'atWord', 'command'],
      read: (fields) => ({
        type: 'cue',
        turnId: readTurnId(fields.at('turnId')),
        beatId: readBeatId(fields.at('beatId')),
        atWord: readWholeNumber(fields.at('atWord')),
        command: readSceneCommand(fields.at('command')),
      }),
    },
    words: {
      keys: ['turnId', 'beatId', 'firstWord', 'words'],
      read: (fields) => ({
        type: 'words',
        turnId: readTurnId(fields.at('turnId')),
        beatId: readBeatId(fields.at('beatId')),
        firstWord: readWholeNumber(fields.at('firstWord')),
        words: readList(fields.at('words'), { maxLength: BEAT_LIMITS.words, readItem: readTimedWord }),
      }),
    },
    beatClosed: {
      keys: ['turnId', 'beatId', 'wordCount', 'expectsReply'],
      read: (fields) => ({
        type: 'beatClosed',
        turnId: readTurnId(fields.at('turnId')),
        beatId: readBeatId(fields.at('beatId')),
        wordCount: readWholeNumber(fields.at('wordCount')),
        expectsReply: readBoolean(fields.at('expectsReply')),
      }),
    },
    yield: {
      keys: ['turnId', 'isYielding'],
      read: (fields) => ({ type: 'yield', turnId: readTurnId(fields.at('turnId')), isYielding: readBoolean(fields.at('isYielding')) }),
    },
    stop: {
      keys: ['turnId'],
      read: (fields) => ({ type: 'stop', turnId: readTurnId(fields.at('turnId')) }),
    },
    audioGap: {
      keys: ['turnId', 'atMs', 'ms'],
      read: (fields) => ({
        type: 'audioGap',
        turnId: readTurnId(fields.at('turnId')),
        atMs: readWholeNumber(fields.at('atMs')),
        ...fields.optional('ms', readAudioGapMs),
      }),
    },
    studentWords: {
      keys: ['text', 'isFinal'],
      read: (fields) => ({ type: 'studentWords', text: readString(fields.at('text'), STUDENT_WORDS_MAX_CHARACTERS), isFinal: readBoolean(fields.at('isFinal')) }),
    },
    heard: { keys: [], read: () => ({ type: 'heard' }) },
    thinking: { keys: ['isThinking'], read: (fields) => ({ type: 'thinking', isThinking: readBoolean(fields.at('isThinking')) }) },
    tutorClosed: { keys: ['reason'], read: (fields) => ({ type: 'tutorClosed', reason: readOneOf(fields.at('reason'), TUTOR_CLOSED_REASONS) }) },
    pulse: { keys: [], read: () => ({ type: 'pulse' }) },
  },
};

const CLOCK_ID_MAX_CHARACTERS = 64;
const MARK_ID_MAX_CHARACTERS = 64;

const STAMP_KEYS = ['clockId', 'browserMs', 'startedMsAgo'];

function readBrowserStamp(fields: CheckedFields): BrowserStamp {
  return { clockId: readString(fields.at('clockId'), CLOCK_ID_MAX_CHARACTERS), browserMs: readWholeNumber(fields.at('browserMs')), startedMsAgo: readWholeNumber(fields.at('startedMsAgo')) };
}

const BROWSER_MESSAGES: VariantTable<BrowserMessage, 'type'> = {
  tag: 'type',
  variants: {
    played: {
      keys: ['turnId', 'beatId', ...STAMP_KEYS, ...PLAY_REPORT_KEYS],
      read: (fields) => ({
        type: 'played',
        turnId: readTurnId(fields.at('turnId')),
        beatId: readBeatId(fields.at('beatId')),
        ...readBrowserStamp(fields),
        ...readPlayReport(fields),
      }),
    },
    acted: {
      keys: [...STAMP_KEYS, 'action'],
      read: (fields) => ({ type: 'acted', ...readBrowserStamp(fields), action: readStudentAction(fields.at('action')) }),
    },
    boardFrozen: {
      keys: ['turnId', ...STAMP_KEYS, 'frozen'],
      read: (fields) => ({
        type: 'boardFrozen',
        turnId: readTurnId(fields.at('turnId')),
        ...readBrowserStamp(fields),
        frozen: readFrozenFrames(fields.at('frozen')),
      }),
    },
    questionHeard: {
      keys: ['turnId', 'beatId', ...STAMP_KEYS],
      read: (fields) => ({
        type: 'questionHeard',
        turnId: readTurnId(fields.at('turnId')),
        beatId: readBeatId(fields.at('beatId')),
        ...readBrowserStamp(fields),
      }),
    },
    hello: {
      keys: [...STAMP_KEYS, 'wantsGreeting'],
      read: (fields) => ({ type: 'hello', ...readBrowserStamp(fields), wantsGreeting: readBoolean(fields.at('wantsGreeting')) }),
    },
    typed: {
      keys: [...STAMP_KEYS, 'text'],
      read: (fields) => ({ type: 'typed', ...readBrowserStamp(fields), text: clipTypedText(readString(fields.at('text'), LIVE_MESSAGE_MAX_BYTES)) }),
    },
    worked: {
      keys: [...STAMP_KEYS, 'work'],
      read: (fields) => ({ type: 'worked', ...readBrowserStamp(fields), work: readStudentWork(fields.at('work')) }),
    },
    paused: {
      keys: [...STAMP_KEYS, 'seconds', 'draft'],
      read: (fields) => ({ type: 'paused', ...readBrowserStamp(fields), seconds: readWholeNumber(fields.at('seconds')), ...fields.optional('draft', (place) => clipTypedText(readString(place, LIVE_MESSAGE_MAX_BYTES))) }),
    },
    stopTutor: {
      keys: STAMP_KEYS,
      read: (fields) => ({ type: 'stopTutor', ...readBrowserStamp(fields) }),
    },
    markNotDrawn: {
      keys: [...STAMP_KEYS, 'markId'],
      read: (fields) => ({ type: 'markNotDrawn', ...readBrowserStamp(fields), markId: readString(fields.at('markId'), MARK_ID_MAX_CHARACTERS) }),
    },
    pulse: {
      keys: [...STAMP_KEYS, 'hearsAgent'],
      read: (fields) => ({ type: 'pulse', ...readBrowserStamp(fields), hearsAgent: readBoolean(fields.at('hearsAgent')) }),
    },
    audioState: {
      keys: [...STAMP_KEYS, 'isRunning'],
      read: (fields) => ({ type: 'audioState', ...readBrowserStamp(fields), isRunning: readBoolean(fields.at('isRunning')) }),
    },
  },
};

function parseLiveMessage<Message>(value: unknown, read: (place: Place) => Message): ParseResult<Message> {
  return toParseResult(() => {
    const place = { value, path: 'message' };
    checkJsonSize(place, LIVE_MESSAGE_MAX_BYTES);
    return read(place);
  });
}

export function parseAgentMessage(value: unknown): ParseResult<AgentMessage> {
  return parseLiveMessage(value, (place) => readVariant<AgentMessage>(place, AGENT_MESSAGES));
}

export function parseBrowserMessage(value: unknown): ParseResult<BrowserMessage> {
  return parseLiveMessage(value, (place) => readVariant<BrowserMessage>(place, BROWSER_MESSAGES));
}
