import { BEAT_LIMITS } from './beat.ts';
import { readBeatId, readTurnId } from './ids.ts';
import { type AgentMessage, type BrowserMessage, type BrowserStamp, LIVE_MESSAGE_MAX_BYTES, type TimedWord } from './live-message.ts';
import { readSceneCommand } from './parse-command.ts';
import { PLAY_REPORT_KEYS, readFrozenFrames, readPlayReport, readStudentAction } from './parse-event.ts';
import {
  type CheckedFields,
  checkJsonSize,
  fail,
  type ParseResult,
  type Place,
  readBoolean,
  readFields,
  readList,
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
  },
};

const STAMP_KEYS = ['browserMs', 'startedMsAgo'];

function readBrowserStamp(fields: CheckedFields): BrowserStamp {
  return { browserMs: readWholeNumber(fields.at('browserMs')), startedMsAgo: readWholeNumber(fields.at('startedMsAgo')) };
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
