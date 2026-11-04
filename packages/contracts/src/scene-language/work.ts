import type { ElementId } from './ids.ts';

/** What code knows about a student's work. `wrong` means code is certain, and only `wrong` lets anyone say so. `unknown` is everything else, and it is never treated as doubt. */
export type WorkVerdict = { status: 'right' } | { status: 'wrong'; why: string; isBuiltOnWrongLine?: boolean } | { status: 'unknown' };

export const LINE_KINDS = ['words', 'math', 'mixed', 'code'] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export type LinePart = { type: 'words'; text: string } | { type: 'math'; text: string; tex: string };

/** How one typed line was read, which the student always sees. */
export interface LineReading {
  kind: LineKind;
  parts: LinePart[];
  /** A line ending in a question mark asks, and claims nothing. */
  isAsking: boolean;
}

/** One point of a drag. `afterMs` counts from the event's `atMs`. */
export interface PointSample {
  afterMs: number;
  x: number;
}

/** What the student did on the board. One way for each way a task can ask. */
/** What a reader made of handwriting. Only the agent writes this, because it is the one that read it. */
export interface InkReading {
  /** The math, if it read math. With none, `text` holds the words. */
  tex?: string;
  /** The reader doubted a symbol, so nothing may be judged on it. */
  isUnsure: boolean;
}

export type StudentWork =
  /** `task` names the task this line answers, if one is open on the student's board. */
  | { way: 'write'; id: ElementId; text: string; task?: ElementId; ink?: InkReading }
  | { way: 'pick'; task: ElementId; part: string }
  /** Holds the item in each slot, or null for an empty slot, in the task's slot order. */
  | { way: 'place'; task: ElementId; placed: (string | null)[] }
  | { way: 'drag'; task: ElementId; x: number; samples: PointSample[] };

/** The longest line the reader will treat as math. Anything longer is read as words. */
export const MATH_LINE_MAX_CHARACTERS = 200;

/** The student's lines take these ids, and a tutor's element may not. */
const STUDENT_LINE_ID = /^s\d+$/;

export const isStudentLineId = (id: string) => STUDENT_LINE_ID.test(id);

const INK_SUFFIX = '-ink-';

/** The strokes of a handwritten line take ids from the line they will become. */
export const getInkStrokeId = (lineId: ElementId, index: number) => `${lineId}${INK_SUFFIX}${index}` as ElementId;

export const getInkLineId = (strokeId: string) => (strokeId.includes(INK_SUFFIX) ? (strokeId.split(INK_SUFFIX)[0] as ElementId) : null);
