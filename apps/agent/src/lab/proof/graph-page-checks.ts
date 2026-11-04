/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
export * from './math-page-checks.ts';

interface LabWindow {
  sceneLab: {
    player: { tick(): void; getNowMs(): number; getOperations(): { kind: string; atMs: number; command?: { kind: string; target?: string; action?: string; overWords?: number }; overMs?: number | null; landsAtMs?: number }[] };
    describeLive(atMs: number): unknown;
    describeReplay(atMs: number): unknown;
    records: { log: { atMs: number; kind: string }[] };
  };
  __figureWatch?: FigureWatch;
  __stopFigureWatch?: () => void;
  __sliderLatency?: number[];
}

export interface FigureWatch {
  frames: number;
  textChecks: number;
  textOverlapFrames: number;
  textOutsideFrames: number;
  notFiniteFrames: number;
  frameGapsMs: number[];
  samples: { atMs: number; board: string }[];
  ballPlaces: string[];
  curveDrawings: Record<string, string[]>;
  examples: string[];
}

const MOST_SAMPLES = 6000;
const TEXT_SHRINK = 1;

const getLab = () => (window as unknown as LabWindow).sceneLab;

function getFigureTexts(root: Element): SVGTextElement[] {
  return [...root.querySelectorAll<SVGTextElement>('svg.board-figure text, .board-notes text')].filter((text) => text.textContent !== '' && getComputedStyle(text).visibility !== 'hidden');
}

function isOverlapping(first: DOMRect, second: DOMRect): boolean {
  return first.left + TEXT_SHRINK < second.right - TEXT_SHRINK && second.left + TEXT_SHRINK < first.right - TEXT_SHRINK && first.top + TEXT_SHRINK < second.bottom - TEXT_SHRINK && second.top + TEXT_SHRINK < first.bottom - TEXT_SHRINK;
}

function checkTexts(board: Element, watch: FigureWatch): void {
  const texts = getFigureTexts(board).map((text) => ({ key: text.getAttribute('data-mark') ?? '', rect: text.getBoundingClientRect(), owner: text.ownerSVGElement?.getBoundingClientRect() }));
  watch.textChecks += texts.length;
  let hasOverlap = false;
  let isOutside = false;
  texts.forEach((first, index) => {
    for (const second of texts.slice(index + 1)) {
      if (!isOverlapping(first.rect, second.rect)) continue;
      hasOverlap = true;
      watch.examples.push(`text ${first.key} on ${second.key}`);
    }
    if (first.owner && (first.rect.left < first.owner.left - 1 || first.rect.right > first.owner.right + 1 || first.rect.top < first.owner.top - 2 || first.rect.bottom > first.owner.bottom + 2)) {
      isOutside = true;
      watch.examples.push(`text ${first.key} outside its figure`);
    }
  });
  if (hasOverlap) watch.textOverlapFrames += 1;
  if (isOutside) watch.textOutsideFrames += 1;
}

function checkFinite(board: Element, watch: FigureWatch): void {
  const isBad = [...board.querySelectorAll('svg.board-figure *')].some((element) => [...element.attributes].some(({ value }) => /NaN|Infinity|undefined/.test(value)));
  if (isBad) watch.notFiniteFrames += 1;
}

function noteMotion(board: Element, watch: FigureWatch): void {
  const ball = board.querySelector('[data-mark="ball"]');
  const place = ball ? `${ball.getAttribute('cx')},${ball.getAttribute('cy')}` : '';
  if (place !== '' && watch.ballPlaces.at(-1) !== place) watch.ballPlaces.push(place);
  for (const curve of board.querySelectorAll('[data-mark^="curve-"]')) {
    const key = curve.getAttribute('data-mark') as string;
    const drawings = (watch.curveDrawings[key] ??= []);
    const length = String(curve.getAttribute('d')?.length ?? 0);
    if (drawings.at(-1) !== length) drawings.push(length);
  }
}

export function startFigureWatch(): void {
  const page = window as unknown as LabWindow;
  const board = document.querySelector('[data-testid="board"]') as HTMLElement;
  const watch: FigureWatch = { frames: 0, textChecks: 0, textOverlapFrames: 0, textOutsideFrames: 0, notFiniteFrames: 0, frameGapsMs: [], samples: [], ballPlaces: [], curveDrawings: {}, examples: [] };
  page.__figureWatch = watch;
  let lastFrameMs = performance.now();
  let isRunning = true;
  const check = () => {
    if (!isRunning) return;
    const nowMs = performance.now();
    watch.frameGapsMs.push(Math.round((nowMs - lastFrameMs) * 10) / 10);
    lastFrameMs = nowMs;
    watch.frames += 1;
    checkTexts(board, watch);
    checkFinite(board, watch);
    noteMotion(board, watch);
    if (watch.samples.length < MOST_SAMPLES) {
      getLab().player.tick();
      const atMs = getLab().player.getNowMs();
      watch.samples.push({ atMs, board: JSON.stringify(getLab().describeLive(atMs)) });
    }
    watch.examples = watch.examples.slice(0, 30);
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
  page.__stopFigureWatch = () => {
    isRunning = false;
  };
}

const NUMBER_ROOM = 0.0015;

// `describeBoard` rounds to 3 decimals, and adding the shift to a time moves it by a floating point hair, so two equal values can round either side of a step.
function isSameBoard(first: unknown, second: unknown): boolean {
  if (typeof first === 'number' && typeof second === 'number') return Math.abs(first - second) <= NUMBER_ROOM;
  if (typeof first !== 'object' || typeof second !== 'object' || first === null || second === null) return first === second;
  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
  return [...keys].every((key) => isSameBoard((first as Record<string, unknown>)[key], (second as Record<string, unknown>)[key]));
}

function getPercentile(values: readonly number[], share: number): number {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
}

function getBallMotion(samples: readonly { board: string }[]): { worstStepBack: number; worstStepForward: number } {
  const seconds = samples.flatMap(({ board }) => (JSON.parse(board) as { elements: { id: string; sceneSeconds?: number; kind: string }[] }).elements.find((element) => element.kind === 'simulate')?.sceneSeconds ?? []);
  const steps = seconds.slice(1).map((value, index) => value - (seconds[index] as number));
  return { worstStepBack: Math.min(0, ...steps), worstStepForward: Math.max(0, ...steps) };
}

export function stopFigureWatch() {
  const page = window as unknown as LabWindow;
  page.__stopFigureWatch?.();
  const watch = page.__figureWatch as FigureWatch;
  const operations = getLab().player.getOperations();
  const liveStart = operations.find((operation) => operation.kind === 'beatStarted')?.atMs ?? 0;
  const logStart = getLab().records.log[0]?.atMs ?? 0;
  const shiftMs = logStart - liveStart;
  const differing = watch.samples.filter(({ atMs, board }) => !isSameBoard(getLab().describeReplay(atMs + shiftMs), JSON.parse(board)));
  const differingExamples = differing.slice(0, 2).map(({ atMs, board }) => ({ atMs, live: board.slice(0, 600), replay: JSON.stringify(getLab().describeReplay(atMs + shiftMs)).slice(0, 600) }));
  const motion = getBallMotion(watch.samples);
  const { frameGapsMs, textChecks, textOverlapFrames, textOutsideFrames, notFiniteFrames, frames, ballPlaces, curveDrawings, examples } = watch;
  return { ...motion, frames, textChecks, textOverlapFrames, textOutsideFrames, notFiniteFrames, ballPlaces, curveDrawings, examples, differingExamples, frameGapP50: getPercentile(frameGapsMs, 0.5), frameGapP95: getPercentile(frameGapsMs, 0.95), frameGapWorst: Math.max(...frameGapsMs), framesOverBudget: frameGapsMs.filter((gap) => gap > 34).length, liveSamples: watch.samples.length, liveSamplesDifferingFromReplay: differing.length };
}

function getPathNumbers(data: string | null): number[] {
  return (data ?? '').match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
}

/** Reads the world off the page, so it checks what was drawn and not what was asked. */
export function getBallMetres(): { x: number; y: number; metresPerPixel: number } | null {
  const ball = document.querySelector('[data-mark="ball"]');
  const axes = getPathNumbers(document.querySelector('svg.board-figure [data-mark="axes"]')?.getAttribute('d') ?? null);
  const tick = [...document.querySelectorAll('svg.board-figure [data-mark^="tick-x-"]')].find((candidate) => candidate.getAttribute('data-mark') !== 'tick-x-0');
  if (!ball || !tick) return null;
  const groundY = axes[1] as number;
  const zeroX = axes[4] as number;
  const metresPerPixel = Number((tick.getAttribute('data-mark') as string).slice('tick-x-'.length)) / (Number(tick.getAttribute('x')) - zeroX);
  return { x: (Number(ball.getAttribute('cx')) - zeroX) * metresPerPixel, y: (groundY - Number(ball.getAttribute('cy'))) * metresPerPixel, metresPerPixel };
}

export function startSliderLatencyWatch(): void {
  const page = window as unknown as LabWindow;
  const latencies: number[] = [];
  page.__sliderLatency = latencies;
  let movedAtMs: number | null = null;
  const input = document.querySelector('.board-slider input') as HTMLInputElement;
  input.addEventListener('input', () => {
    movedAtMs = performance.now();
  });
  new MutationObserver(() => {
    if (movedAtMs === null) return;
    latencies.push(Math.round((performance.now() - movedAtMs) * 10) / 10);
    movedAtMs = null;
  }).observe(document.querySelector('svg.board-figure') as Element, { subtree: true, attributes: true, attributeFilter: ['d'] });
}

export function getSliderLatency(): { moves: number; p50: number; p95: number; worst: number } {
  const latencies = (window as unknown as LabWindow).__sliderLatency ?? [];
  return { moves: latencies.length, p50: getPercentile(latencies, 0.5), p95: getPercentile(latencies, 0.95), worst: Math.max(0, ...latencies) };
}

/** For each cue over words, its last aim against when its last word really started, read from the log. */
export function getLandingErrors(): { cues: number; aims: number; errorsMs: number[] } {
  const log = getLab().records.log as unknown as { kind: string; beat: { script: (string | { overWords?: number })[] }; wordStartsMs: number[]; firedCueMs: number[]; cueAims?: { cue: number; landsAtMs: number }[] }[];
  const errorsMs: number[] = [];
  let aims = 0;
  for (const event of log) {
    if (event.kind !== 'beatPlayed') continue;
    aims += event.cueAims?.length ?? 0;
    let wordsBefore = 0;
    let cue = 0;
    for (const part of event.beat.script) {
      if (typeof part === 'string') {
        wordsBefore += part.split(/\s+/).filter((word) => word !== '').length;
        continue;
      }
      const lastWordMs = part.overWords === undefined ? undefined : event.wordStartsMs[wordsBefore + part.overWords];
      const aim = event.cueAims?.filter((aim) => aim.cue === cue).at(-1)?.landsAtMs ?? lastWordMs;
      if (cue < event.firedCueMs.length && lastWordMs !== undefined && aim !== undefined) errorsMs.push(aim - lastWordMs);
      cue += 1;
    }
  }
  return { cues: errorsMs.length, aims, errorsMs };
}
