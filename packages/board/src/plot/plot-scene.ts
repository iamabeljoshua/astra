import { evaluatePlotExpression, parsePlotExpression, type Plot, type PlotNode } from '@astra/contracts';
import type { Scene, SceneParameters } from '../player/scene.ts';
import { type AxisRange, getAutoYRange } from './axis-ticks.ts';
import { getFiniteTop, type SampledCurve } from './measure-peak.ts';
import { type CurveDrawing, GOLDEN_RATIO, sampleCurve } from './sample-curve.ts';

export interface PlotFrame {
  yRange: AxisRange;
  /** Only where it lies inside `xRange`, because a curve drawn over another can reach past its axes. */
  getCurve(yRange: AxisRange, xRange?: AxisRange): CurveDrawing;
  getValue(x: number): number;
}

interface PlotData {
  node: PlotNode;
  yRange: AxisRange;
  scenes: Map<string, Scene<PlotFrame>>;
}

const RANGE_SAMPLES = 96;
const WAVE_SAMPLES = 2000;
/** Shared across a curve's sets of constants, because a curve with four has 82 of them and placing it is already a long task on a slow phone. */
const WAVE_SAMPLES_IN_ALL = 4000;
/** A sample sits anywhere in its own step, so two can lie this many steps apart. */
const WIDEST_GAP_IN_STEPS = 2;
/** A top past the axes by this share of them is under a pixel, and moving the axes for it would cost a round number. */
const TOP_PAST_AXES_SHARE = 1 / 200;
const REMEMBERED_SCENES = 48;
const NO_MOMENTS = {};
const NOTHING_DRAWN: CurveDrawing = { branches: [], isTooFine: false };
const PLOT_PARTS = ['curve'] as const;
const LEVELS_BY_CONSTANT_COUNT = [1, 9, 5, 3, 3];

const plotDataByCommand = new WeakMap<Plot, PlotData | null>();

function getEvaluator(node: PlotNode, constants: ReadonlyMap<string, number>) {
  return (x: number) => evaluatePlotExpression(node, x, constants);
}

// Evenly through each range and not only its ends, because a curve such as 5*sin(a) peaks in the middle.
function getConstantSets(plot: Plot): ReadonlyMap<string, number>[] {
  const declared = plot.constants ?? [];
  const levels = LEVELS_BY_CONSTANT_COUNT[declared.length] ?? 1;
  const start = new Map(declared.map(({ name, value }) => [name, value]));
  const spread = declared.reduce<Map<string, number>[]>((sets, { name, min, max }) => sets.flatMap((set) => Array.from({ length: levels }, (_, level) => new Map(set).set(name, min + ((max - min) * level) / (levels - 1)))), [new Map(start)]);
  return [start, ...(declared.length > 0 ? spread : [])];
}

type Evaluate = (x: number) => number;

function getFittedRange(evaluators: readonly Evaluate[], domain: AxisRange): AxisRange {
  const spacing = (domain[1] - domain[0]) / RANGE_SAMPLES;
  const xs = Array.from({ length: RANGE_SAMPLES + 1 }, (_, index) => domain[0] + ((domain[1] - domain[0]) * index) / RANGE_SAMPLES);
  const curves = evaluators.map((evaluate) => ({ evaluate, samples: xs.map((x) => ({ x, y: evaluate(x) })) }));
  return getAutoYRange(curves.flatMap(({ samples }) => samples.map(({ y }) => y)), ({ beyond, direction }) => getFiniteTop(curves, { above: beyond, direction, spacing, domain }));
}

// Each sample sits anywhere in its own step, because a wave can meet an even or a nearly even grid at the same phase every time and look small or flat.
function getScatteredCurve(evaluate: Evaluate, [low, high]: AxisRange, steps: number): SampledCurve {
  const getPlace = (index: number) => (index === 0 || index === steps ? index : index + (index * GOLDEN_RATIO) % 1 - 1 / 2) / steps;
  return { evaluate, samples: Array.from({ length: steps + 1 }, (_, index) => {
    const x = low + (high - low) * getPlace(index);
    return { x, y: evaluate(x) };
  }) };
}

/** The fit reads the coarse samples a pole needs, so a wave those samples missed comes back here, climbed from the highest of many samples and left out only if it grows without bound. */
function getRangeWithWholeTops(fitted: AxisRange, evaluators: readonly Evaluate[], domain: AxisRange): AxisRange {
  const steps = Math.min(WAVE_SAMPLES, Math.floor(WAVE_SAMPLES_IN_ALL / evaluators.length));
  const curves = evaluators.map((evaluate) => getScatteredCurve(evaluate, domain, steps));
  const spacing = ((domain[1] - domain[0]) / steps) * WIDEST_GAP_IN_STEPS;
  const getTop = (direction: 1 | -1) => getFiniteTop(curves, { above: -direction * Number.POSITIVE_INFINITY, direction, spacing, domain });
  const pastAxes = (fitted[1] - fitted[0]) * TOP_PAST_AXES_SHARE;
  const [top, bottom] = [getTop(1), getTop(-1)];
  const low = bottom !== null && bottom < fitted[0] - pastAxes ? bottom : fitted[0];
  const high = top !== null && top > fitted[1] + pastAxes ? top : fitted[1];
  return low === fitted[0] && high === fitted[1] ? fitted : getAutoYRange([low, high]);
}

function getPlotYRange(plot: Plot, node: PlotNode): AxisRange {
  if (plot.yRange) return plot.yRange;
  const evaluators = getConstantSets(plot).map((constants) => getEvaluator(node, constants));
  return getRangeWithWholeTops(getFittedRange(evaluators, plot.domain), evaluators, plot.domain);
}

function getPlotData(plot: Plot): PlotData | null {
  const known = plotDataByCommand.get(plot);
  if (known !== undefined) return known;
  const node = parsePlotExpression(plot.expression, new Set(plot.constants?.map(({ name }) => name)));
  const data = node && { node, yRange: getPlotYRange(plot, node), scenes: new Map() };
  plotDataByCommand.set(plot, data);
  return data;
}

function getConstantValues(plot: Plot, changes: SceneParameters): SceneParameters {
  return Object.fromEntries((plot.constants ?? []).map(({ name, value, min, max }) => [name, Math.min(max, Math.max(min, changes[name] ?? value))]));
}

function buildPlotScene(plot: Plot, { node, yRange }: PlotData, values: SceneParameters): Scene<PlotFrame> {
  const evaluate = getEvaluator(node, new Map(Object.entries(values)));
  const curves = new Map<string, CurveDrawing>();
  const frame: PlotFrame = {
    yRange,
    getValue: evaluate,
    getCurve(asked, [low, high] = plot.domain) {
      const domain: AxisRange = [Math.max(low, plot.domain[0]), Math.min(high, plot.domain[1])];
      const key = `${asked.join()}|${domain.join()}`;
      const curve = curves.get(key) ?? (domain[1] > domain[0] ? sampleCurve({ evaluate, domain, yRange: asked }) : NOTHING_DRAWN);
      curves.set(key, curve);
      return curve;
    },
  };
  return { parts: PLOT_PARTS, moments: NO_MOMENTS, durationSeconds: 0, values, getFrame: () => frame };
}

/** A curve as a scene with no timeline of its own, whose constants are its parameters. */
export function createPlotScene(plot: Plot, changes: SceneParameters): Scene<PlotFrame> | null {
  const data = getPlotData(plot);
  if (!data) return null;
  const values = getConstantValues(plot, changes);
  const key = JSON.stringify(values);
  const scene = data.scenes.get(key) ?? buildPlotScene(plot, data, values);
  data.scenes.delete(key);
  data.scenes.set(key, scene);
  if (data.scenes.size > REMEMBERED_SCENES) data.scenes.delete(data.scenes.keys().next().value as string);
  return scene;
}
