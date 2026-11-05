import { BEAT_LIMITS } from './beat.ts';
import { readBeatId, readElementId, readSceneId, readTurnId } from './ids.ts';
import { type AgentMessage, type BrowserMessage, type BrowserStamp, clipTypedText, LIVE_MESSAGE_MAX_BYTES, SESSION_TITLE_MAX_CHARACTERS, STUDENT_WORDS_MAX_CHARACTERS, type TimedWord, TOLD_BOARD_PROBLEMS, TUTOR_CLOSED_REASONS } from './live-message.ts';
import { readSceneCommand } from './parse-command.ts';
import { PLAY_REPORT_KEYS, readFrozenFrames, readPlayReport, readStudentAction, readStudentWork } from './parse-event.ts';
import { readSessionRecap } from './parse-recap.ts';
import { SCENE_ENGINES } from './scene-command.ts';
import type { SceneAgentMessage, SceneBrowserMessage } from './scene-message.ts';
import {
  type CheckedFields,
  checkJsonSize,
  fail,
  type ParseResult,
  type Place,
  readBoolean,
  readFields,
  readList,
  readNumberInRange,
  readOneOf,
  readString,
  readVariant,
  readWholeNumber,
  toParseResult,
  type VariantTable,
} from './read.ts';

const MOST_COST_USD = 1_000_000;
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
    workRead: {
      keys: ['work'],
      read: (fields) => ({ type: 'workRead', work: readStudentWork(fields.at('work')) }),
    },
    studentWords: {
      keys: ['text', 'isFinal'],
      read: (fields) => ({ type: 'studentWords', text: readString(fields.at('text'), STUDENT_WORDS_MAX_CHARACTERS), isFinal: readBoolean(fields.at('isFinal')) }),
    },
    heard: { keys: [], read: () => ({ type: 'heard' }) },
    thinking: { keys: ['isThinking'], read: (fields) => ({ type: 'thinking', isThinking: readBoolean(fields.at('isThinking')) }) },
    costSoFar: { keys: ['usd'], read: (fields) => ({ type: 'costSoFar', usd: readNumberInRange(fields.at('usd'), { min: 0, max: MOST_COST_USD }) }) },
    sessionTitle: { keys: ['title'], read: (fields) => ({ type: 'sessionTitle', title: readString(fields.at('title'), SESSION_TITLE_MAX_CHARACTERS) }) },
    tutorClosed: { keys: ['reason'], read: (fields) => ({ type: 'tutorClosed', reason: readOneOf(fields.at('reason'), TUTOR_CLOSED_REASONS) }) },
    pulse: { keys: [], read: () => ({ type: 'pulse' }) },
    earsOpen: { keys: [], read: () => ({ type: 'earsOpen' }) },
    quietWarning: { keys: ['isOn'], read: (fields) => ({ type: 'quietWarning', isOn: readBoolean(fields.at('isOn')) }) },
    closingForQuiet: { keys: [], read: () => ({ type: 'closingForQuiet' }) },
    recap: {
      keys: ['recap'],
      read: (fields) => {
        const recap = fields.at('recap');
        return { type: 'recap', recap: recap.value === null ? null : readSessionRecap(recap) };
      },
    },
  },
};

const CLOCK_ID_MAX_CHARACTERS = 64;
const MARK_ID_MAX_CHARACTERS = 64;
const BOARD_PROBLEM_SUBJECT_MAX_CHARACTERS = 120;

const STAMP_KEYS = ['clockId', 'browserMs', 'startedMsAgo'];
const MOST_STROKES_IN_A_LINE = 200;

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
      keys: [...STAMP_KEYS, 'text', 'isOpening'],
      read: (fields) => ({ type: 'typed', ...readBrowserStamp(fields), text: clipTypedText(readString(fields.at('text'), LIVE_MESSAGE_MAX_BYTES)), ...fields.optional('isOpening', readBoolean) }),
    },
    worked: {
      keys: [...STAMP_KEYS, 'work'],
      read: (fields) => ({ type: 'worked', ...readBrowserStamp(fields), work: readStudentWork(fields.at('work')) }),
    },
    paused: {
      keys: [...STAMP_KEYS, 'seconds', 'draft'],
      read: (fields) => ({ type: 'paused', ...readBrowserStamp(fields), seconds: readWholeNumber(fields.at('seconds')), ...fields.optional('draft', (place) => clipTypedText(readString(place, LIVE_MESSAGE_MAX_BYTES))) }),
    },
    inkDone: {
      keys: [...STAMP_KEYS, 'id', 'strokes', 'task'],
      read: (fields) => ({ type: 'inkDone', ...readBrowserStamp(fields), id: readElementId(fields.at('id')), strokes: readList(fields.at('strokes'), { maxLength: MOST_STROKES_IN_A_LINE, readItem: readElementId }), ...fields.optional('task', readElementId) }),
    },
    inkPeek: {
      keys: [...STAMP_KEYS, 'strokes'],
      read: (fields) => ({ type: 'inkPeek', ...readBrowserStamp(fields), strokes: readList(fields.at('strokes'), { maxLength: MOST_STROKES_IN_A_LINE, readItem: readElementId }) }),
    },
    typing: {
      keys: STAMP_KEYS,
      read: (fields) => ({ type: 'typing', ...readBrowserStamp(fields) }),
    },
    stopTutor: {
      keys: STAMP_KEYS,
      read: (fields) => ({ type: 'stopTutor', ...readBrowserStamp(fields) }),
    },
    markNotDrawn: {
      keys: [...STAMP_KEYS, 'markId'],
      read: (fields) => ({ type: 'markNotDrawn', ...readBrowserStamp(fields), markId: readString(fields.at('markId'), MARK_ID_MAX_CHARACTERS) }),
    },
    boardProblem: {
      keys: [...STAMP_KEYS, 'problem', 'subject'],
      read: (fields) => ({ type: 'boardProblem', ...readBrowserStamp(fields), problem: readOneOf(fields.at('problem'), TOLD_BOARD_PROBLEMS), subject: readString(fields.at('subject'), BOARD_PROBLEM_SUBJECT_MAX_CHARACTERS) }),
    },
    pulse: {
      keys: [...STAMP_KEYS, 'hearsAgent'],
      read: (fields) => ({ type: 'pulse', ...readBrowserStamp(fields), hearsAgent: readBoolean(fields.at('hearsAgent')) }),
    },
    audioState: {
      keys: [...STAMP_KEYS, 'isRunning'],
      read: (fields) => ({ type: 'audioState', ...readBrowserStamp(fields), isRunning: readBoolean(fields.at('isRunning')) }),
    },
    stillHere: {
      keys: STAMP_KEYS,
      read: (fields) => ({ type: 'stillHere', ...readBrowserStamp(fields) }),
    },
    endingSession: {
      keys: STAMP_KEYS,
      read: (fields) => ({ type: 'endingSession', ...readBrowserStamp(fields) }),
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

const SCENE_AGENT_MESSAGES: VariantTable<SceneAgentMessage, 'type'> = {
  tag: 'type',
  variants: {
    loadScene: {
      keys: ['sceneId', 'durationSeconds', 'engine'],
      read: (fields) => ({
        type: 'loadScene',
        sceneId: readSceneId(fields.at('sceneId')),
        durationSeconds: readNumberInRange(fields.at('durationSeconds'), { min: 0.1, max: 600 }),
        ...fields.optional('engine', (field) => readOneOf(field, SCENE_ENGINES)),
      }),
    },
    prepareScene: { keys: ['sceneId', 'engine'], read: (fields) => ({ type: 'prepareScene', sceneId: readSceneId(fields.at('sceneId')), ...fields.optional('engine', (field) => readOneOf(field, SCENE_ENGINES)) }) },
    noLesson: { keys: [], read: () => ({ type: 'noLesson' }) },
    voiceAtLimit: { keys: [], read: () => ({ type: 'voiceAtLimit' }) },
  },
};

const SCENE_BROWSER_MESSAGES: VariantTable<SceneBrowserMessage, 'type'> = {
  tag: 'type',
  variants: {
    sceneDevice: { keys: ['canPlay'], read: (fields) => ({ type: 'sceneDevice', canPlay: readBoolean(fields.at('canPlay')) }) },
    sceneLoaded: { keys: ['sceneId'], read: (fields) => ({ type: 'sceneLoaded', sceneId: readSceneId(fields.at('sceneId')) }) },
    scenePrepared: { keys: ['sceneId'], read: (fields) => ({ type: 'scenePrepared', sceneId: readSceneId(fields.at('sceneId')) }) },
    sceneRefused: { keys: ['sceneId'], read: (fields) => ({ type: 'sceneRefused', sceneId: readSceneId(fields.at('sceneId')) }) },
  },
};

export function parseSceneAgentMessage(value: unknown): ParseResult<SceneAgentMessage> {
  return toParseResult(() => readVariant<SceneAgentMessage>({ value, path: 'message' }, SCENE_AGENT_MESSAGES));
}

export function parseSceneBrowserMessage(value: unknown): ParseResult<SceneBrowserMessage> {
  return toParseResult(() => readVariant<SceneBrowserMessage>({ value, path: 'message' }, SCENE_BROWSER_MESSAGES));
}
