import { getGeometryMarks } from '../geometry/geometry-figure.ts';
import { getSimulationMarks } from '../motion/simulation-figure.ts';
import type { BoardElement } from '../player/board-state.ts';
import { getNumberLineMarks, NUMBER_LINE_HEIGHT } from '../plot/number-line-figure.ts';
import { getPlotMarks } from '../plot/plot-figure.ts';
import { getSketchMarks } from '../sketch/sketch-figure.ts';
import { PAD } from '../sketch/sketch-layout.ts';
import type { FigureFrame } from './figure-input.ts';
import type { FigureMark } from './figure-marks.ts';

const FIGURE_SHAPE = 0.72;
/** The prototype draws its graphs 620 by 340. */
const PLOT_SHAPE = 340 / 620;

const FIGURE_MARKS = { plot: getPlotMarks, numberLine: getNumberLineMarks, geometry: getGeometryMarks, simulate: getSimulationMarks, sketch: getSketchMarks } as const;

type FigureKind = keyof typeof FIGURE_MARKS;

export function getFigureMarks(frame: FigureFrame): FigureMark[] {
  return FIGURE_MARKS[frame.element.content.kind as FigureKind](frame);
}

export function getFigureFit(element: BoardElement, maxWidth: number): { fit: 'line' | 'figure'; size: { width: number; height: number } } {
  if (element.content.kind === 'numberLine') return { fit: 'line', size: { width: maxWidth, height: NUMBER_LINE_HEIGHT } };
  const shape = element.content.kind === 'plot' ? PLOT_SHAPE : element.content.kind === 'sketch' ? PAD.height / PAD.width : FIGURE_SHAPE;
  return { fit: 'figure', size: { width: maxWidth, height: maxWidth * shape } };
}
