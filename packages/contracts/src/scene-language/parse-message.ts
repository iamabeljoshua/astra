import { BEAT_LIMITS } from './beat.ts';
import { readBeatId, readTurnId } from './ids.ts';
import { type AgentMessage, type BrowserMessage, LIVE_MESSAGE_MAX_BYTES, type TimedWord } from './live-message.ts';
import { readSceneCommand } from './parse-command.ts';
import { PLAY_REPORT_KEYS, readFrozenList, readPlayReport, readStudentAction } from './parse-event.ts';
import {
  checkJsonSize,
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
      keys: ['turnId', 'beatId', 'wordCount'],
      read: (fields) => ({
        type: 'beatClosed',
        turnId: readTurnId(fields.at('turnId')),
        beatId: readBeatId(fields.at('beatId')),
        wordCount: readWholeNumber(fields.at('wordCount')),
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
  },
};

const BROWSER_MESSAGES: VariantTable<BrowserMessage, 'type'> = {
  tag: 'type',
  variants: {
    played: {
      keys: ['turnId', 'beatId', 'startedMsAgo', ...PLAY_REPORT_KEYS],
      read: (fields) => ({
        type: 'played',
        turnId: readTurnId(fields.at('turnId')),
        beatId: readBeatId(fields.at('beatId')),
        startedMsAgo: readWholeNumber(fields.at('startedMsAgo')),
        ...readPlayReport(fields),
      }),
    },
    acted: {
      keys: ['action'],
      read: (fields) => ({ type: 'acted', action: readStudentAction(fields.at('action')) }),
    },
    boardFrozen: {
      keys: ['turnId', 'frozen'],
      read: (fields) => ({ type: 'boardFrozen', turnId: readTurnId(fields.at('turnId')), frozen: readFrozenList(fields.at('frozen')) }),
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
