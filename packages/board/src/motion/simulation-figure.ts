import type { Simulate, Slider, TrackVector } from '@astra/contracts';
import { FIGURE_LIMITS, type FigureFrame, getAttachedElements, getDrawnShare, getShownValue, keepNewestOnFigure } from '../figure/figure-input.ts';
import { addArrow, addAxes, addLabel, addPartMark, addSoftLine, createFigureDraft, type FigureDraft, finishFigure, getFixedVectorTip } from '../figure/figure-draft.ts';
import { type Branch, type FigureMark, interpolate, type Point } from '../figure/figure-marks.ts';
import { createEqualView, type FigureView, getPixelBranches } from '../figure/figure-view.ts';
import { LABEL_FONT, wrapLabel } from '../figure/place-labels.ts';
import { easeInOut } from '../math/paint-flights.ts';
import type { BoardElement } from '../player/board-state.ts';
import { PLANNED_SCENES } from '../player/planned-scenes.ts';
import type { Scene, SceneParameters } from '../player/scene.ts';
import { formatNumber } from '../plot/axis-ticks.ts';
import type { ProjectileFrame } from './projectile-scene.ts';

const MARGIN = { left: 38, right: 16, top: 14, bottom: 26 };
const PATH_STEPS = 72;
const BALL_RADIUS = 6;
const BALL_ROOM = 9;
const WORLD_SIDE_ROOM = 0.06;
const FOCUS_DOT = { radius: 3.5, above: 15 };
const MOST_SLIDERS_FITTED = 4;
const SLIDER_LEVELS_BY_COUNT = [1, 9, 5, 3, 3];
const ARROW_SECONDS = 0.25;
const RIM_HEIGHT = 3.05;
const HOOP = { rimRadius: 0.225, boardGap: 0.15, boardBelowRim: 0.15, boardAboveRim: 0.9, armLength: 0.6, armHeight: 3.7, shareOfRangeWhenShort: 0.75 };

interface WorldBounds {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

type SimulationElement = BoardElement & { content: Simulate };
type ParameterSlider = Slider & { parameter: string };

interface ReadoutRow {
  key: string;
  lines: string[];
}

const getFrameAt = (scene: Scene, seconds: number) => scene.getFrame(seconds) as ProjectileFrame;

const pathByScene = new WeakMap<Scene, readonly Branch[]>();

function getScenePath(scene: Scene): readonly Branch[] {
  const known = pathByScene.get(scene);
  if (known) return known;
  const points = Array.from({ length: PATH_STEPS + 1 }, (_, step) => getFrameAt(scene, (step / PATH_STEPS) * scene.durationSeconds).ball);
  const path = [points];
  pathByScene.set(scene, path);
  return path;
}

function getArcBounds(scene: Scene): WorldBounds {
  const points = getScenePath(scene)[0] as Branch;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(0, ...ys), top: Math.max(...ys, getFrameAt(scene, scene.moments.peak ?? 0).ball.y) };
}

const joinBounds = (first: WorldBounds, second: WorldBounds): WorldBounds => ({ left: Math.min(first.left, second.left), right: Math.max(first.right, second.right), bottom: Math.min(first.bottom, second.bottom), top: Math.max(first.top, second.top) });

const blendBounds = (from: WorldBounds, to: WorldBounds, share: number): WorldBounds => ({ left: interpolate(from.left, to.left, share), right: interpolate(from.right, to.right, share), bottom: interpolate(from.bottom, to.bottom, share), top: interpolate(from.top, to.top, share) });

// Evenly through each range, because a launch angle lands farthest in the middle. Then the axes hold still through a whole drag.
function getSliderValues(sliders: readonly ParameterSlider[], base: SceneParameters): SceneParameters[] {
  const kept = sliders.slice(-MOST_SLIDERS_FITTED);
  const levels = SLIDER_LEVELS_BY_COUNT[kept.length] ?? 1;
  return kept.reduce<SceneParameters[]>((sets, { parameter, min, max }) => sets.flatMap((set) => Array.from({ length: levels }, (_, level) => ({ ...set, [parameter]: min + ((max - min) * level) / (levels - 1) }))), [base]);
}

const sliderReachByCommand = new WeakMap<Simulate, Map<string, WorldBounds>>();

function getSliderReach(command: Simulate, { sliders, base, quantity }: { sliders: readonly ParameterSlider[]; base: SceneParameters; quantity: string | null }): WorldBounds {
  const known = sliderReachByCommand.get(command) ?? new Map<string, WorldBounds>();
  sliderReachByCommand.set(command, known);
  const key = JSON.stringify([sliders.map(({ parameter, min, max }) => [parameter, min, max]), base, quantity]);
  const getBounds = (scene: Scene) => (quantity === null ? getArcBounds(scene) : getReach(scene, quantity));
  const reach = known.get(key) ?? getSliderValues(sliders, base).map((values) => getBounds(PLANNED_SCENES(command, values) as Scene)).reduce(joinBounds);
  known.set(key, reach);
  return reach;
}

function getReach(scene: Scene, quantity: string): WorldBounds {
  const start = getFrameAt(scene, 0);
  const end = getFrameAt(scene, scene.durationSeconds);
  const sideways = start.velocity.x * ARROW_SECONDS;
  const arc = getArcBounds(scene);
  if (quantity === 'acceleration') return { ...arc, bottom: end.ball.y + start.acceleration.y * ARROW_SECONDS };
  return { left: arc.left + Math.min(0, sideways), right: arc.right + Math.max(0, sideways), top: arc.top + Math.max(0, start.velocity.y) * ARROW_SECONDS, bottom: Math.min(arc.bottom, end.ball.y + end.velocity.y * ARROW_SECONDS) };
}

function getHoopCenter(baseScene: Scene): number {
  const atRimHeight = (getScenePath(baseScene)[0] as Branch).filter((point) => point.y >= RIM_HEIGHT).at(-1);
  return atRimHeight?.x ?? getArcBounds(baseScene).right * HOOP.shareOfRangeWhenShort;
}

const getBoardX = (rimX: number) => rimX + HOOP.rimRadius + HOOP.boardGap;
const getPoleX = (rimX: number) => getBoardX(rimX) + HOOP.armLength;

function getHoopBranches(rimX: number): Branch[] {
  const boardX = getBoardX(rimX);
  const poleX = getPoleX(rimX);
  return [
    [{ x: rimX - HOOP.rimRadius, y: RIM_HEIGHT }, { x: boardX, y: RIM_HEIGHT }],
    [{ x: boardX, y: RIM_HEIGHT - HOOP.boardBelowRim }, { x: boardX, y: RIM_HEIGHT + HOOP.boardAboveRim }],
    [{ x: boardX, y: HOOP.armHeight }, { x: poleX, y: HOOP.armHeight }, { x: poleX, y: 0 }],
  ];
}

function getChangesNoSliderHolds(changes: SceneParameters, sliders: readonly ParameterSlider[]): SceneParameters {
  return Object.fromEntries(Object.entries(changes).filter(([name]) => !sliders.some(({ parameter }) => parameter === name)));
}

function getStartingBounds(root: SimulationElement, { attached, baseScene, others }: { attached: readonly BoardElement[]; baseScene: Scene; others: SceneParameters }): WorldBounds {
  const held = Object.keys(others).length === 0 ? [] : [root.placedScene?.scene as Scene];
  const arcs = [baseScene, ...held, ...attached.flatMap((element) => element.ghostScene ?? [])].map(getArcBounds).reduce(joinBounds);
  return root.content.over ? joinBounds(arcs, { left: 0, right: getPoleX(getHoopCenter(baseScene)), bottom: 0, top: RIM_HEIGHT + HOOP.boardAboveRim }) : arcs;
}

function getWorldBounds(root: SimulationElement, attached: readonly BoardElement[], frame: FigureFrame, baseScene: Scene): WorldBounds {
  const sliders = attached.filter((element): element is BoardElement & { content: ParameterSlider } => element.content.kind === 'slider' && 'parameter' in element.content);
  const sliderCommands = sliders.map(({ content }) => content);
  const others = getChangesNoSliderHolds(root.placedScene?.parameterChanges ?? {}, sliderCommands);
  const start = getStartingBounds(root, { attached, baseScene, others });
  const withSliders = sliders.reduce((bounds, slider, index) => blendBounds(bounds, joinBounds(bounds, getSliderReach(root.content, { sliders: sliderCommands.slice(0, index + 1), base: others, quantity: null })), easeInOut(getDrawnShare(slider, frame))), start);
  const tracked = attached.filter((element): element is BoardElement & { content: TrackVector } => element.content.kind === 'trackVector');
  const scene = root.placedScene?.scene as Scene;
  const getArrowReach = (quantity: string) => (sliderCommands.length > 0 ? getSliderReach(root.content, { sliders: sliderCommands, base: others, quantity }) : getReach(scene, quantity));
  return tracked.reduce((bounds, element) => blendBounds(bounds, joinBounds(bounds, getArrowReach(element.content.quantity)), easeInOut(getDrawnShare(element, frame))), withSliders);
}

function getView(bounds: WorldBounds, frame: FigureFrame, readoutsHeight: number): FigureView {
  const roomX = (bounds.right - bounds.left) * WORLD_SIDE_ROOM;
  const roomY = (bounds.top - bounds.bottom) * WORLD_SIDE_ROOM;
  const rect = { left: MARGIN.left, top: MARGIN.top + readoutsHeight, right: frame.width - MARGIN.right, bottom: frame.height - MARGIN.bottom };
  return createEqualView({ xRange: [bounds.left - roomX, bounds.right + roomX], yRange: [bounds.bottom, bounds.top + roomY], rect, keepsLowEnds: true });
}

function addPath(draft: FigureDraft, scene: Scene, { view, seconds }: { view: FigureView; seconds: number }): Point {
  const [whole] = getPixelBranches(getScenePath(scene), view);
  const points = whole as Branch;
  const ball = view.toPixel(getFrameAt(scene, seconds).ball);
  draft.marks.push({ kind: 'path', key: 'path', tone: 'ink-2', weight: 'hair', isDashed: true, branches: [points] });
  const passedSteps = scene.durationSeconds > 0 ? Math.floor((seconds / scene.durationSeconds) * PATH_STEPS) : 0;
  const trail = seconds >= scene.durationSeconds ? points : [...points.slice(0, passedSteps + 1), ball];
  draft.marks.push({ kind: 'path', key: 'trail', tone: 'ink', weight: 'thin', branches: seconds > 0 ? [trail] : [] });
  addSoftLine(draft, [points]);
  return ball;
}

function getQuantityArrow(frame: ProjectileFrame, quantity: string): Point {
  if (quantity === 'velocity-x') return { x: frame.velocity.x, y: 0 };
  if (quantity === 'velocity-y') return { x: 0, y: frame.velocity.y };
  return quantity === 'acceleration' ? frame.acceleration : frame.velocity;
}

function addOnBall(draft: FigureDraft, element: BoardElement, { ballAt, world, view, frame, scene }: { ballAt: Point; world: ProjectileFrame; view: FigureView; frame: FigureFrame; scene: Scene }): void {
  const { content } = element;
  const share = getDrawnShare(element, frame);
  if (content.kind === 'ghostPath' && element.ghostScene) draft.marks.unshift({ kind: 'path', key: `ghost-${element.id}`, tone: 'ink-2', weight: 'thin', branches: share >= 1 ? getPixelBranches(getScenePath(element.ghostScene), view) : [] });
  if (content.kind === 'vector') addArrow(draft, { key: `vector-${element.id}`, from: ballAt, to: getFixedVectorTip(ballAt, content, frame), share, tone: 'ink', label: content.label });
  if ((content.kind === 'annotate' || content.kind === 'highlight') && content.target.includes('.')) addPartMark(draft, { key: `note-${element.id}`, at: view.toPixel(getFrameAt(scene, element.targetSecondsWhenPlaced ?? 0).ball), mark: content.kind === 'annotate' ? content.mark : 'circle', share, label: content.kind === 'annotate' ? content.label : undefined });
  if (content.kind === 'trackVector') {
    const arrow = getQuantityArrow(world, content.quantity);
    const to = view.toPixel({ x: world.ball.x + arrow.x * ARROW_SECONDS, y: world.ball.y + arrow.y * ARROW_SECONDS });
    addArrow(draft, { key: `tracked-${element.id}`, from: ballAt, to, share, tone: 'ink-2', label: content.label });
  }
}

function getReadoutValue(quantity: string, { scene, world, seconds }: { scene: Scene; world: ProjectileFrame; seconds: number }): number {
  switch (quantity) {
    case 'time':
      return seconds;
    case 'height':
      return world.ball.y;
    case 'distance':
      return world.ball.x;
    case 'speed':
      return Math.hypot(world.velocity.x, world.velocity.y);
    case 'velocity-x':
      return world.velocity.x;
    case 'velocity-y':
      return world.velocity.y;
    case 'peak-height':
      return getFrameAt(scene, scene.moments.peak ?? 0).ball.y;
    default:
      return getFrameAt(scene, scene.durationSeconds).ball.x;
  }
}

function getReadoutLines(attached: readonly BoardElement[], { frame, scene, world, seconds }: { frame: FigureFrame; scene: Scene; world: ProjectileFrame; seconds: number }): ReadoutRow[] {
  const maxWidth = frame.width - MARGIN.left - MARGIN.right;
  const rows = attached.flatMap((element) => {
    const { content } = element;
    if (content.kind !== 'readout' || getDrawnShare(element, frame) <= 0) return [];
    const { label, unit } = frame.words.readouts[content.quantity];
    const value = formatNumber(getReadoutValue(content.quantity, { scene, world, seconds }), 3);
    return [{ key: `readout-${element.id}`, lines: wrapLabel(`${content.label ?? label} ${value} ${unit}`.trim(), maxWidth) }];
  });
  return keepNewestReadoutsThatFit(rows, frame.height * FIGURE_LIMITS.readoutShareOfHeight);
}

function keepNewestReadoutsThatFit(rows: readonly ReadoutRow[], maxHeight: number): ReadoutRow[] {
  const kept: ReadoutRow[] = [];
  let height = 0;
  for (const row of [...rows].reverse()) {
    height += row.lines.length * LABEL_FONT.lineHeight;
    if (height > maxHeight) break;
    kept.unshift(row);
  }
  return kept;
}

function addReadouts(draft: FigureDraft, rows: readonly ReadoutRow[]): void {
  let top = MARGIN.top;
  for (const { key, lines } of rows) {
    draft.marks.push({ kind: 'text', key, at: { x: MARGIN.left, y: top + LABEL_FONT.ascent }, lines, anchor: 'start', tone: 'ink' });
    top += lines.length * LABEL_FONT.lineHeight;
  }
  if (rows.length > 0) draft.mustAvoid.push({ left: MARGIN.left, top: MARGIN.top, right: draft.bounds.right - MARGIN.right, bottom: top });
}

function addLandingNote(draft: FigureDraft, { scene, view, seconds, hasSlider, metres }: { scene: Scene; view: FigureView; seconds: number; hasSlider: boolean; metres: string }): void {
  if (seconds < scene.durationSeconds && !hasSlider) return;
  const landing = getFrameAt(scene, scene.durationSeconds).ball;
  addLabel(draft, { key: 'landing-label', text: `${formatNumber(landing.x, 3)} ${metres}`, anchor: view.toPixel(landing), gap: 8, sides: ['above-right', 'above', 'above-left', 'right', 'left'], tone: 'ink-2' });
}

export function getSimulationMarks(frame: FigureFrame): FigureMark[] {
  const root = frame.element as SimulationElement;
  const placed = root.placedScene;
  const draft = createFigureDraft(frame.width, frame.height);
  if (!placed) return [];
  const { scene } = placed;
  const baseScene = PLANNED_SCENES(root.content, {}) as Scene;
  const seconds = getShownValue(placed.playhead, frame);
  const world = getFrameAt(scene, seconds);
  const attached = keepNewestOnFigure(getAttachedElements(frame.board, root.id));
  const rows = getReadoutLines(attached, { frame, scene, world, seconds });
  addReadouts(draft, rows);
  const readoutsHeight = rows.reduce((sum, { lines }) => sum + lines.length * LABEL_FONT.lineHeight, 0);
  const view = getView(getWorldBounds(root, attached, frame, baseScene), frame, readoutsHeight);
  const share = getDrawnShare(root, frame);
  addAxes(draft, view, { share, hideTicksBelow: 0 });
  if (root.content.over) draft.marks.push({ kind: 'path', key: 'hoop', tone: 'ink-2', weight: 'thin', branches: share >= 1 ? getHoopBranches(getHoopCenter(baseScene)).map((branch) => branch.map(view.toPixel)) : [] });
  const ballAt = addPath(draft, scene, { view, seconds });
  for (const element of attached) addOnBall(draft, element, { ballAt, world, view, frame, scene });
  addLandingNote(draft, { scene, view, seconds, hasSlider: attached.some((element) => element.content.kind === 'slider'), metres: frame.words.metres });
  draft.marks.push({ kind: 'dot', key: 'ball', at: ballAt, radius: BALL_RADIUS * share, tone: 'ink' });
  draft.mustAvoid.push({ left: ballAt.x - BALL_ROOM, top: ballAt.y - BALL_ROOM, right: ballAt.x + BALL_ROOM, bottom: ballAt.y + BALL_ROOM });
  if (frame.board.focus === `${root.id}.ball`) draft.marks.push({ kind: 'dot', key: 'focus-dot', at: { x: ballAt.x, y: ballAt.y - FOCUS_DOT.above }, radius: FOCUS_DOT.radius, tone: 'ink-2' });
  return finishFigure(draft, frame.onLabelWithoutRoom);
}
