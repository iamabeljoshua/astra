import { BEAT_LIMITS, type FrozenFrame, getBeatText, getCues, getSpokenWords } from './beat.ts';
import { readBeatId, readElementId, readFileId, readTurnId } from './ids.ts';
import { readBeat } from './parse-beat.ts';
import { readParameterValue, readRevealPoint, readSimulationSeconds } from './parse-command.ts';
import {
  fail,
  type CheckedFields,
  getField,
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
import { SIMULATION_PARAMETERS, type SimulationParameter } from './scene-command.ts';
import {
  BEAT_ENDINGS,
  type BeatPlayed,
  type InkPoint,
  PLAY_REPORTERS,
  type PlayReport,
  type SessionEvent,
  type SessionEventBody,
  type SliderSample,
  SPEECH_SOURCES,
  type StudentAction,
} from './session-event.ts';

const LIMITS = { text: 2000, name: 200, frozen: 32, strokePoints: 300, sliderSamples: 300 } as const;
const FRACTION = { min: 0, max: 1 } as const;
const INK_POINT_LENGTH = 3;
const STAMP_KEYS = ['seq', 'atMs'];
const FROZEN_VALUE_NAMES = ['simulationSeconds', 'revealedUpTo', 'drawnFraction'];

export const PLAY_REPORT_KEYS = ['wordStartsMs', 'durationMs', 'playedWords', 'firedCueMs', 'ending', 'frozen'];

function readFraction(place: Place): number {
  return readNumberInRange(place, FRACTION);
}

function readFrozenFrame(place: Place): FrozenFrame {
  const fields = readFields(place, ['target', ...FROZEN_VALUE_NAMES]);
  const values = {
    ...fields.optional('simulationSeconds', readSimulationSeconds),
    ...fields.optional('revealedUpTo', readRevealPoint),
    ...fields.optional('drawnFraction', readFraction),
  };
  if (Object.keys(values).length !== 1) fail(place, `exactly one of ${FROZEN_VALUE_NAMES.join(', ')}`);
  return { target: readElementId(fields.at('target')), ...values } as FrozenFrame;
}

export function readFrozenFrames(place: Place): FrozenFrame[] {
  return readList(place, { maxLength: LIMITS.frozen, readItem: readFrozenFrame });
}

function readInkPoint(place: Place): InkPoint {
  const [x, y, afterMs] = readList(place, { maxLength: INK_POINT_LENGTH, readItem: (item) => item });
  if (x === undefined || y === undefined || afterMs === undefined) fail(place, 'x, y, and afterMs');
  return [readFraction(x), readFraction(y), readWholeNumber(afterMs)];
}

function readSliderSample(place: Place, parameter: SimulationParameter): SliderSample {
  const fields = readFields(place, ['afterMs', 'value']);
  return { afterMs: readWholeNumber(fields.at('afterMs')), value: readParameterValue(fields.at('value'), parameter) };
}

const STUDENT_ACTIONS: VariantTable<StudentAction, 'action'> = {
  tag: 'action',
  variants: {
    sliderDragged: {
      keys: ['target', 'parameter', 'samples'],
      read: (fields) => {
        const parameter = readOneOf(fields.at('parameter'), SIMULATION_PARAMETERS);
        return {
          action: 'sliderDragged',
          target: readElementId(fields.at('target')),
          parameter,
          samples: readList(fields.at('samples'), { maxLength: LIMITS.sliderSamples, readItem: (sample) => readSliderSample(sample, parameter) }),
        };
      },
    },
    rewound: {
      keys: ['turnId', 'toBeat'],
      read: (fields) => ({ action: 'rewound', turnId: readTurnId(fields.at('turnId')), toBeat: readBeatId(fields.at('toBeat')) }),
    },
    inkStroke: {
      keys: ['id', 'points'],
      read: (fields) => ({
        action: 'inkStroke',
        id: readElementId(fields.at('id')),
        points: readList(fields.at('points'), { maxLength: LIMITS.strokePoints, readItem: readInkPoint }),
      }),
    },
    inkErased: {
      keys: ['target'],
      read: (fields) => ({ action: 'inkErased', target: readElementId(fields.at('target')) }),
    },
    fileShared: {
      keys: ['fileId', 'name'],
      read: (fields) => ({ action: 'fileShared', fileId: readFileId(fields.at('fileId')), name: readString(fields.at('name'), LIMITS.name) }),
    },
  },
};

export function readStudentAction(place: Place): StudentAction {
  return readVariant<StudentAction>(place, STUDENT_ACTIONS);
}

function readTimesInOrder(place: Place, maxLength: number): number[] {
  const times = readList(place, { maxLength, readItem: readWholeNumber });
  const isInOrder = times.every((time, index) => index === 0 || time >= (times[index - 1] as number));
  if (!isInOrder) fail(place, 'times in order');
  return times;
}

export function readPlayReport(fields: CheckedFields): PlayReport {
  const wordStartsMs = readTimesInOrder(fields.at('wordStartsMs'), BEAT_LIMITS.words);
  const playedWords = readWholeNumber(fields.at('playedWords'));
  if (playedWords > wordStartsMs.length) fail(fields.at('playedWords'), 'no more words than there are word times');
  const durationMs = readWholeNumber(fields.at('durationMs'));
  if (durationMs < (wordStartsMs[playedWords - 1] ?? 0)) fail(fields.at('durationMs'), 'the audio to reach the last word played');
  const firedCueMs = readTimesInOrder(fields.at('firedCueMs'), BEAT_LIMITS.commands);
  const ending = readOneOf(fields.at('ending'), BEAT_ENDINGS);
  return { wordStartsMs, durationMs, playedWords, firedCueMs, ending, frozen: readFrozenFrames(fields.at('frozen')) };
}

function readBeatPlayed(fields: CheckedFields): BeatPlayed {
  const beat = readBeat(fields.at('beat'));
  const report = readPlayReport(fields);
  const wordCount = getSpokenWords(getBeatText(beat)).length;
  const cueCount = getCues(beat).length;
  if (report.wordStartsMs.length > wordCount) fail(fields.at('wordStartsMs'), `no more than the beat's ${wordCount} words`);
  const isFinished = report.ending === 'finished';
  if (isFinished && report.playedWords !== wordCount) fail(fields.at('playedWords'), `all ${wordCount} words of a finished beat`);
  if (report.firedCueMs.length > cueCount) fail(fields.at('firedCueMs'), `no more than the beat's ${cueCount} cues`);
  const reportedBy = readOneOf(fields.at('reportedBy'), PLAY_REPORTERS);
  return { kind: 'beatPlayed', turnId: readTurnId(fields.at('turnId')), beat, ...report, reportedBy };
}

const EVENT_BODIES: VariantTable<SessionEventBody, 'kind'> = {
  tag: 'kind',
  variants: {
    beatPlayed: {
      keys: [...STAMP_KEYS, 'turnId', 'beat', ...PLAY_REPORT_KEYS, 'reportedBy'],
      read: readBeatPlayed,
    },
    studentSpoke: {
      keys: [...STAMP_KEYS, 'text', 'source', 'isReaction', 'durationMs'],
      read: (fields) => ({
        kind: 'studentSpoke',
        text: readString(fields.at('text'), LIMITS.text),
        source: readOneOf(fields.at('source'), SPEECH_SOURCES),
        isReaction: readBoolean(fields.at('isReaction')),
        durationMs: readWholeNumber(fields.at('durationMs')),
      }),
    },
    studentActed: {
      keys: [...STAMP_KEYS, 'action'],
      read: (fields) => ({ kind: 'studentActed', action: readStudentAction(fields.at('action')) }),
    },
    connectionGap: {
      keys: [...STAMP_KEYS, 'durationMs'],
      read: (fields) => ({ kind: 'connectionGap', durationMs: readWholeNumber(fields.at('durationMs')) }),
    },
    boardFrozen: {
      keys: [...STAMP_KEYS, 'turnId', 'frozen'],
      read: (fields) => ({ kind: 'boardFrozen', turnId: readTurnId(fields.at('turnId')), frozen: readFrozenFrames(fields.at('frozen')) }),
    },
  },
};

function readSessionEvent(place: Place): SessionEvent {
  const body = readVariant<SessionEventBody>(place, EVENT_BODIES);
  return { seq: readWholeNumber(getField(place, 'seq')), atMs: readWholeNumber(getField(place, 'atMs')), ...body };
}

export function parseSessionEvent(value: unknown): ParseResult<SessionEvent> {
  return toParseResult(() => readSessionEvent({ value, path: 'event' }));
}
