export type AxisRange = readonly [number, number];

const NICE_STEPS = [1, 2, 5, 10];
const MINUS = '−';
const LARGEST_PLAIN = 1e6;
const SMALLEST_PLAIN = 1e-3;
/** A computed zero can come out as 1e-15. */
const ROUNDING_DUST = 1e-9;
const MOST_DECIMALS = 12;

/** The round step that gives about this many ticks, so a scale reads 0, 2, 4 and not 0, 1.83, 3.67. */
export function getTickStep(range: AxisRange, tickCount: number): number {
  const rough = (range[1] - range[0]) / Math.max(1, tickCount);
  const power = 10 ** Math.floor(Math.log10(rough));
  return (NICE_STEPS.find((step) => step * power >= rough) ?? 10) * power;
}

/** Capped, because `toFixed` throws past 100 digits and a throw during paint takes the whole page. */
export const getStepDecimals = (step: number) => Math.min(MOST_DECIMALS, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));

export function getTickValues(range: AxisRange, tickCount: number): number[] {
  const step = getTickStep(range, tickCount);
  const decimals = getStepDecimals(step);
  const first = Math.ceil(range[0] / step - 1e-9);
  const last = Math.floor(range[1] / step + 1e-9);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => Number(((first + index) * step).toFixed(decimals)) + 0);
}

function withMinus(text: string): string {
  return text.startsWith('-') ? `${MINUS}${text.slice(1)}` : text;
}

export function formatTick(value: number, range: AxisRange, tickCount: number): string {
  if (value === 0) return '0';
  const size = Math.max(Math.abs(range[0]), Math.abs(range[1]));
  const step = getTickStep(range, tickCount);
  if (size >= LARGEST_PLAIN) return withMinus(value.toExponential(Math.max(1, Math.ceil(Math.log10(size / step)))).replace('e+', 'e'));
  return withMinus((value + 0).toFixed(getStepDecimals(step)));
}

export function formatNumber(value: number, significant = 3): string {
  const size = Math.abs(value);
  if (size < ROUNDING_DUST) return '0';
  if (size >= LARGEST_PLAIN || size < SMALLEST_PLAIN) return withMinus(value.toExponential(1).replace('e+', 'e'));
  const decimals = Math.max(0, significant - 1 - Math.floor(Math.log10(size)));
  const text = value.toFixed(Math.min(decimals, 4));
  const trimmed = text.includes('.') ? text.replace(/\.?0+$/, '') : text;
  return trimmed === '-0' ? '0' : withMinus(trimmed);
}

const OUTLIER_FACTOR = 3;
const LOW_SHARE = 0.1;
const HIGH_SHARE = 0.9;
const ZERO_PULL = 0.25;
const ROUGH_TICKS = 8;
const FLAT_ROOM = 1;
const FLAT_ROOM_SHARE = 1e-3;
/** A range wider than this can overflow, and nothing this far out fits a figure with anything else. */
const LARGEST_FITTED_VALUE = 1e300;

function getQuantile(sorted: readonly number[], share: number): number {
  return sorted[Math.round(share * (sorted.length - 1))] as number;
}

function getCoreRange(sorted: readonly number[]): [number, number] {
  const coreLow = getQuantile(sorted, LOW_SHARE);
  const coreHigh = getQuantile(sorted, HIGH_SHARE);
  const room = OUTLIER_FACTOR * (coreHigh - coreLow);
  const lowest = sorted[0] as number;
  const highest = sorted.at(-1) as number;
  return [coreLow - lowest > room ? coreLow - (coreHigh - coreLow) / 2 : lowest, highest - coreHigh > room ? coreHigh + (coreHigh - coreLow) / 2 : highest];
}

function pullToZero([low, high]: [number, number]): [number, number] {
  const room = (high - low) * ZERO_PULL;
  if (low > 0 && low < room) return [0, high];
  if (high < 0 && -high < room) return [low, 0];
  return [low, high];
}

/** Fits the curve's values, leaving out the far reaches near an asymptote, on round numbers. */
export function getAutoYRange(values: readonly number[]): AxisRange {
  const sorted = values.filter((value) => Math.abs(value) <= LARGEST_FITTED_VALUE).sort((first, second) => first - second);
  if (sorted.length === 0) return [-FLAT_ROOM, FLAT_ROOM];
  const [low, high] = pullToZero(getCoreRange(sorted));
  const room = Math.max(FLAT_ROOM, Math.abs(low) * FLAT_ROOM_SHARE);
  if (high - low < 1e-9) return [low - room, high + room];
  const step = getTickStep([low, high], ROUGH_TICKS);
  const [fittedLow, fittedHigh] = [Math.floor(low / step) * step, Math.ceil(high / step) * step];
  return fittedHigh > fittedLow ? [fittedLow, fittedHigh] : [low - room, high + room];
}
