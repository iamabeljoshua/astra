import { evaluatePlotExpression, parsePlotExpression, type Plot, type PlotNode } from '@astra/contracts';
import type { Branch } from '../figure/figure-marks.ts';
import type { Scene, SceneParameters } from '../player/scene.ts';
import { type AxisRange, getAutoYRange } from './axis-ticks.ts';
import { sampleCurve } from './sample-curve.ts';

export interface PlotFrame {
  yRange: AxisRange;
  /** Only where it lies inside `xRange`, because a curve drawn over another can reach past its axes. */
  getCurve(yRange: AxisRange, xRange?: AxisRange): readonly Branch[];
  getValue(x: number): number;
}

interface PlotData {
  node: PlotNode;
  yRange: AxisRange;
  scenes: Map<string, Scene<PlotFrame>>;
}

const RANGE_SAMPLES = 96;
const REMEMBERED_SCENES = 48;
const NO_MOMENTS = {};
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

function getPlotYRange(plot: Plot, node: PlotNode): AxisRange {
  if (plot.yRange) return plot.yRange;
  const [low, high] = plot.domain;
  const values = getConstantSets(plot).flatMap((constants) => {
    const evaluate = getEvaluator(node, constants);
    return Array.from({ length: RANGE_SAMPLES + 1 }, (_, index) => evaluate(low + ((high - low) * index) / RANGE_SAMPLES));
  });
  return getAutoYRange(values);
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
  const curves = new Map<string, readonly Branch[]>();
  const frame: PlotFrame = {
    yRange,
    getValue: evaluate,
    getCurve(asked, [low, high] = plot.domain) {
      const domain: AxisRange = [Math.max(low, plot.domain[0]), Math.min(high, plot.domain[1])];
      const key = `${asked.join()}|${domain.join()}`;
      const curve = curves.get(key) ?? (domain[1] > domain[0] ? sampleCurve({ evaluate, domain, yRange: asked }) : []);
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
