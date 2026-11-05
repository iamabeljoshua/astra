export const CHECK_WIDTH: number;
export const CHECK_HEIGHT: number;

export interface CheckedLabel {
  text: string;
  to?: { x: number; y: number };
  alpha: number;
  width: number;
}

/** One sampled second: its picture at the check's small size, and what the watch heard while it drew. */
export interface CheckedFrame {
  seconds: number;
  cells: Uint8ClampedArray;
  width: number;
  height: number;
  labels: readonly CheckedLabel[];
  clippedTexts: readonly string[];
  brokenTexts: readonly string[];
  brokenNumbers: readonly string[];
}

export function getFrameProblems(frames: readonly CheckedFrame[]): string[];
export function getLostPointers(frames: readonly CheckedFrame[]): string[];
export function getCheckTimes(timing: { moments: Record<string, number>; duration: number }): number[];
