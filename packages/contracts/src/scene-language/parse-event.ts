import { BEAT_LIMITS, getBeatText, getCues, getSpokenWords } from './beat.ts';
import { readBeatId, readElementId, readFileId, readTurnId } from './ids.ts';
import { readBeat } from './parse-beat.ts';
import {
  fail,
  type CheckedFields,
  getField,
  type ParseResult,
  type Place,
  readBoolean,
  readFields,
  readList,
  readNumber,
  readOneOf,
  readString,
  readVariant,
  readWholeNumber,
  toParseResult,
  type VariantTable,
} from './read.ts';
import { SIMULATION_PARAMETERS } from './scene-command.ts';
import {
  BEAT_ENDINGS,
  type BeatPlayed,
  type FrozenSimulation,
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
const INK_POINT_LENGTH = 3;
const STAMP_KEYS = ['seq', 'atMs'];

export const PLAY_REPORT_KEYS = ['wordStartsMs', 'durationMs', 'playedWords', 'firedCues', 'ending', 'frozen'];

function readFrozen(place: Place): FrozenSimulation {
  const fields = readFields(place, ['target', 'simulationSeconds']);
  return { target: readElementId(fields.at('target')), simulationSeconds: readNumber(fields.at('simulationSeconds')) };
}

export function readFrozenList(place: Place): FrozenSimulation[] {
  return readList(place, { maxLength: LIMITS.frozen, readItem: readFrozen });
}

function readInkFraction(place: Place): number {
  const fraction = readNumber(place);
  if (fraction < 0 || fraction > 1) fail(place, 'a fraction from 0 to 1');
  return fraction;
}

function readInkPoint(place: Place): InkPoint {
  const [x, y, afterMs] = readList(place, { maxLength: INK_POINT_LENGTH, readItem: (item) => item });
  if (x === undefined || y === undefined || afterMs === undefined) fail(place, 'x, y, and afterMs');
  return [readInkFraction(x), readInkFraction(y), readWholeNumber(afterMs)];
}

function readSliderSample(place: Place): SliderSample {
  const fields = readFields(place, ['afterMs', 'value']);
  return { afterMs: readWholeNumber(fields.at('afterMs')), value: readNumber(fields.at('value')) };
}

const STUDENT_ACTIONS: VariantTable<StudentAction, 'action'> = {
  tag: 'action',
  variants: {
    sliderDragged: {
      keys: ['target', 'parameter', 'samples'],
      read: (fields) => ({
        action: 'sliderDragged',
        target: readElementId(fields.at('target')),
        parameter: readOneOf(fields.at('parameter'), SIMULATION_PARAMETERS),
        samples: readList(fields.at('samples'), { maxLength: LIMITS.sliderSamples, readItem: readSliderSample }),
      }),
    },
    rewound: {
      keys: ['toBeat'],
      read: (fields) => ({ action: 'rewound', toBeat: readBeatId(fields.at('toBeat')) }),
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

function readWordStarts(place: Place): number[] {
  const wordStartsMs = readList(place, { maxLength: BEAT_LIMITS.words, readItem: readWholeNumber });
  const isInOrder = wordStartsMs.every((startMs, index) => index === 0 || startMs >= (wordStartsMs[index - 1] as number));
  if (!isInOrder) fail(place, 'times in order');
  return wordStartsMs;
}

export function readPlayReport(fields: CheckedFields): PlayReport {
  const wordStartsMs = readWordStarts(fields.at('wordStartsMs'));
  const playedWords = readWholeNumber(fields.at('playedWords'));
  if (playedWords > wordStartsMs.length) fail(fields.at('playedWords'), 'no more words than there are word times');
  const durationMs = readWholeNumber(fields.at('durationMs'));
  if (durationMs < (wordStartsMs.at(-1) ?? 0)) fail(fields.at('durationMs'), 'the audio to reach the last word');
  const firedCues = readWholeNumber(fields.at('firedCues'));
  if (firedCues > BEAT_LIMITS.commands) fail(fields.at('firedCues'), `at most ${BEAT_LIMITS.commands} cues`);
  const ending = readOneOf(fields.at('ending'), BEAT_ENDINGS);
  return { wordStartsMs, durationMs, playedWords, firedCues, ending, frozen: readFrozenList(fields.at('frozen')) };
}

function readBeatPlayed(fields: CheckedFields): BeatPlayed {
  const beat = readBeat(fields.at('beat'));
  const report = readPlayReport(fields);
  const wordCount = getSpokenWords(getBeatText(beat)).length;
  const cueCount = getCues(beat).length;
  if (report.wordStartsMs.length > wordCount) fail(fields.at('wordStartsMs'), `no more than the beat's ${wordCount} words`);
  const isFinished = report.ending === 'finished';
  if (isFinished && report.playedWords !== wordCount) fail(fields.at('playedWords'), `all ${wordCount} words of a finished beat`);
  if (report.firedCues > cueCount) fail(fields.at('firedCues'), `no more than the beat's ${cueCount} cues`);
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
      read: (fields) => ({ kind: 'boardFrozen', turnId: readTurnId(fields.at('turnId')), frozen: readFrozenList(fields.at('frozen')) }),
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
