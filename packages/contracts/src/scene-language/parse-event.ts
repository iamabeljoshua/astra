import { BEAT_LIMITS, type FrozenFrame, getBeatText, getCues, getSpokenWords } from './beat.ts';
import { readBeatId, readElementId, readFileId, readTurnId } from './ids.ts';
import { getTexProblem } from './math-tex.ts';
import { readBeat } from './parse-beat.ts';
import { readConstantSliderTarget, readConstantValue, readParameterValue, readRevealPoint, readSimulationSeconds } from './parse-command.ts';
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
import { SIMULATION_PARAMETERS } from './scene-command.ts';
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
import { clipTypedText } from './live-message.ts';
import { type InkReading, LINE_KINDS, type LinePart, type LineReading, type PointSample, type StudentWork, type WorkVerdict } from './work.ts';

const LIMITS = { text: 2000, name: 200, frozen: 32, strokePoints: 300, sliderSamples: 300, tex: 500, lineParts: 64, why: 600, slots: 12 } as const;
const COORDINATE = { min: -1e6, max: 1e6 } as const;
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

function readSliderSample(place: Place, readValue: (value: Place) => number): SliderSample {
  const fields = readFields(place, ['afterMs', 'value']);
  return { afterMs: readWholeNumber(fields.at('afterMs')), value: readValue(fields.at('value')) };
}

function readDragTarget(fields: CheckedFields) {
  if (fields.at('constant').value !== undefined) return { ...readConstantSliderTarget(fields), readValue: readConstantValue };
  const parameter = readOneOf(fields.at('parameter'), SIMULATION_PARAMETERS);
  return { parameter, readValue: (value: Place) => readParameterValue(value, parameter) };
}

function readLinePart(place: Place): LinePart {
  const fields = readFields(place, ['type', 'text', 'tex']);
  const type = readOneOf(fields.at('type'), ['words', 'math']);
  const text = readString(fields.at('text'), LIMITS.text);
  if (type === 'words') return { type, text };
  const tex = readString(fields.at('tex'), LIMITS.tex);
  if (getTexProblem(tex) !== null) fail(fields.at('tex'), 'math the board can set');
  return { type, text, tex };
}

export function readLineReading(place: Place): LineReading {
  const fields = readFields(place, ['kind', 'parts', 'isAsking']);
  return { kind: readOneOf(fields.at('kind'), LINE_KINDS), parts: readList(fields.at('parts'), { maxLength: LIMITS.lineParts, readItem: readLinePart }), isAsking: readBoolean(fields.at('isAsking')) };
}

function readWorkVerdict(place: Place): WorkVerdict {
  const fields = readFields(place, ['status', 'why', 'isBuiltOnWrongLine']);
  const status = readOneOf(fields.at('status'), ['right', 'wrong', 'unknown']);
  if (status !== 'wrong') return { status };
  return { status, why: readString(fields.at('why'), LIMITS.why), ...fields.optional('isBuiltOnWrongLine', readBoolean) };
}

function readPointSample(place: Place): PointSample {
  const fields = readFields(place, ['afterMs', 'x']);
  return { afterMs: readWholeNumber(fields.at('afterMs')), x: readNumberInRange(fields.at('x'), COORDINATE) };
}

function readPlacedSlot(place: Place): string | null {
  return place.value === null ? null : readString(place, LIMITS.name);
}

function readInkReading(place: Place): InkReading {
  const fields = readFields(place, ['tex', 'isUnsure']);
  const tex = fields.optional('tex', (texPlace) => {
    const value = readString(texPlace, LIMITS.tex);
    if (getTexProblem(value) !== null) fail(texPlace, 'math the board can set');
    return value;
  });
  return { ...tex, isUnsure: readBoolean(fields.at('isUnsure')) };
}

const STUDENT_WORK: VariantTable<StudentWork, 'way'> = {
  tag: 'way',
  variants: {
    write: {
      keys: ['id', 'text', 'task', 'ink'],
      read: (fields) => ({ way: 'write', id: readElementId(fields.at('id')), text: clipTypedText(readString(fields.at('text'), LIMITS.text)), ...fields.optional('task', readElementId), ...fields.optional('ink', readInkReading) }),
    },
    pick: {
      keys: ['task', 'part'],
      read: (fields) => ({ way: 'pick', task: readElementId(fields.at('task')), part: readString(fields.at('part'), LIMITS.name) }),
    },
    place: {
      keys: ['task', 'placed'],
      read: (fields) => ({ way: 'place', task: readElementId(fields.at('task')), placed: readList(fields.at('placed'), { maxLength: LIMITS.slots, readItem: readPlacedSlot }) }),
    },
    drag: {
      keys: ['task', 'x', 'samples'],
      read: (fields) => ({ way: 'drag', task: readElementId(fields.at('task')), x: readNumberInRange(fields.at('x'), COORDINATE), samples: readList(fields.at('samples'), { maxLength: LIMITS.sliderSamples, readItem: readPointSample }) }),
    },
  },
};

export function readStudentWork(place: Place): StudentWork {
  return readVariant<StudentWork>(place, STUDENT_WORK);
}

const STUDENT_ACTIONS: VariantTable<StudentAction, 'action'> = {
  tag: 'action',
  variants: {
    sliderDragged: {
      keys: ['target', 'parameter', 'constant', 'samples'],
      read: (fields) => {
        const { readValue, ...dragged } = readDragTarget(fields);
        return {
          action: 'sliderDragged',
          target: readElementId(fields.at('target')),
          ...dragged,
          samples: readList(fields.at('samples'), { maxLength: LIMITS.sliderSamples, readItem: (sample) => readSliderSample(sample, readValue) }),
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
    worked: {
      keys: ['work', 'reading', 'verdict', 'closesTask'],
      read: (fields) => ({
        action: 'worked',
        work: readStudentWork(fields.at('work')),
        ...fields.optional('reading', readLineReading),
        verdict: readWorkVerdict(fields.at('verdict')),
        ...fields.optional('closesTask', readElementId),
      }),
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
