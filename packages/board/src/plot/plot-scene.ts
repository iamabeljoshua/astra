import { evaluatePlotExpression, parsePlotExpression, type Plot, type PlotNode } from '@astra/contracts';
import type { Branch } from '../figure/figure-marks.ts';
import type { Scene, SceneParameters } from '../player/scene.ts';
import { type AxisRange, getAutoYRange } from './axis-ticks.ts';
import { sampleCurve } from './sample-curve.ts';

export interface PlotFrame {
  /** The scale for the axes, which stays put as a constant changes, so the change shows. */
  yRange: AxisRange;
  /** Sampled the first time it is asked for, because a drag passes through values no frame draws. */
  getCurve(yRange: AxisRange): readonly Branch[];
  /** The curve's own value, which a mark on it shows. */
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

const plotDataByCommand = new WeakMap<Plot, PlotData | null>();

function getEvaluator(node: PlotNode, constants: ReadonlyMap<string, number>) {
  return (x: number) => evaluatePlotExpression(node, x, constants);
}

// Every corner of the constants' ranges, so no drag can carry the curve off the axes the student started with.
function getConstantCorners(plot: Plot): ReadonlyMap<string, number>[] {
  const declared = plot.constants ?? [];
  const start = new Map(declared.map(({ name, value }) => [name, value]));
  const corners = declared.reduce<Map<string, number>[]>((sets, { name, min, max }) => sets.flatMap((set) => [new Map(set).set(name, min), new Map(set).set(name, max)]), [new Map(start)]);
  return [start, ...(declared.length > 0 ? corners : [])];
}

function getPlotYRange(plot: Plot, node: PlotNode): AxisRange {
  if (plot.yRange) return plot.yRange;
  const [low, high] = plot.domain;
  const values = getConstantCorners(plot).flatMap((constants) => {
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
    getCurve(asked) {
      const key = asked.join();
      const curve = curves.get(key) ?? sampleCurve({ evaluate, domain: plot.domain, yRange: asked });
      curves.set(key, curve);
      return curve;
    },
  };
  return { parts: PLOT_PARTS, moments: NO_MOMENTS, durationSeconds: 0, values, getFrame: () => frame };
}

/** A curve as a scene with no timeline of its own, whose constants are its parameters. The same command and values give the same scene object. */
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
