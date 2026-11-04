import type { ElementId, ElementRef, FileId } from './ids.ts';

export const DRAWINGS = ['hoop-side'] as const;
export type DrawingName = (typeof DRAWINGS)[number];

export const IMAGE_ASSETS = ['great-wave', 'school-of-athens', 'saturn'] as const;
export type ImageAsset = (typeof IMAGE_ASSETS)[number];

export interface SimulationParameterRule {
  readonly min: number;
  readonly max: number;
  readonly default?: number;
}

/** A parameter added later comes with a `default`, so older stored rows still parse. A name means one thing across models. */
export const SIMULATION_MODELS = {
  projectile: {
    parameters: {
      horizontalSpeed: { min: -100, max: 100 },
      upwardSpeed: { min: -100, max: 100 },
      releaseHeight: { min: 0, max: 1000 },
      gravity: { min: 0.1, max: 100, default: 9.81 },
    },
    /** A slider or the tutor can change these. They are worked out from the speeds, so a simulation never stores them. */
    controls: {
      launchAngle: { min: -90, max: 90 },
      launchSpeed: { min: 0, max: 150 },
    },
  },
} as const satisfies Record<string, { parameters: Record<string, SimulationParameterRule>; controls: Record<string, SimulationParameterRule> }>;

type ModelTable = typeof SIMULATION_MODELS;
export type SimulationModel = keyof ModelTable;
type ParameterOf<Model extends SimulationModel> = keyof ModelTable[Model]['parameters'];
type ControlOf<Model extends SimulationModel> = keyof ModelTable[Model]['controls'];
export type SimulationParameter = { [Model in SimulationModel]: ParameterOf<Model> | ControlOf<Model> }[SimulationModel];

const MODEL_PARAMETERS: Record<string, SimulationParameterRule>[] = Object.values(SIMULATION_MODELS).map(({ parameters, controls }) => ({ ...parameters, ...controls }));

export const SIMULATION_PARAMETER_RULES = Object.assign({}, ...MODEL_PARAMETERS) as Record<SimulationParameter, SimulationParameterRule>;

export const SIMULATION_PARAMETERS = Object.keys(SIMULATION_PARAMETER_RULES) as SimulationParameter[];

/** A flight takes one of these pairs at a time, because sliders from both could not each hold what a student set. */
const SPEED_PAIRS = [['horizontalSpeed', 'upwardSpeed'], ['launchSpeed', 'launchAngle']] as const satisfies readonly (readonly SimulationParameter[])[];

export function getSpeedPairs(name: string): { own: readonly string[]; other: readonly string[] } | null {
  const [first, second]: readonly [readonly string[], readonly string[]] = SPEED_PAIRS;
  if (first.includes(name)) return { own: first, other: second };
  return second.includes(name) ? { own: second, other: first } : null;
}

export const TRACKED_QUANTITIES = ['velocity', 'velocity-x', 'velocity-y', 'acceleration'] as const;
export type TrackedQuantity = (typeof TRACKED_QUANTITIES)[number];

export const READOUT_QUANTITIES = ['time', 'height', 'distance', 'speed', 'velocity-x', 'velocity-y', 'peak-height', 'landing-distance'] as const;
export type ReadoutQuantity = (typeof READOUT_QUANTITIES)[number];

export const VECTOR_LENGTHS = ['short', 'medium', 'long'] as const;
export type VectorLength = (typeof VECTOR_LENGTHS)[number];

export const ANNOTATION_MARKS = ['underline', 'circle', 'check', 'cross'] as const;
/** What the writer says a line of math is, because a line that follows another need not follow from it. `step` follows and is equal, `new` has no tie to the line before, `shown` is there to look at and is not asserted, and `relation` is tied some other way, as a derivative or a rounding is. */
export const MATH_CLAIMS = ['step', 'new', 'shown', 'relation'] as const;
export type MathClaim = (typeof MATH_CLAIMS)[number];
export type AnnotationMark = (typeof ANNOTATION_MARKS)[number];

export const SIMULATION_MOMENTS = ['release', 'peak', 'landing'] as const;
export type SimulationMoment = (typeof SIMULATION_MOMENTS)[number];

/** A named moment of the element's scene, or seconds of 0 or more. A simulation has its fixed moments, and a stored scene names its own. */
export type SimulationPoint = string | number;

export const SCENE_ENGINES = ['manimgx'] as const;
export type SceneEngine = (typeof SCENE_ENGINES)[number];

export const SCENE_ENGINE_VERSIONS = { manimgx: '0.1.1' } as const satisfies Record<SceneEngine, string>;

/** Motion the engine computes from named values in SI units. */
export interface ProjectileSimulation {
  model: 'projectile';
  parameters: Record<ParameterOf<'projectile'>, number>;
}

export type Simulation = ProjectileSimulation;

export type GeometryStep =
  | { shape: 'point'; name: string; x: number; y: number }
  | { shape: 'segment'; from: string; to: string }
  | { shape: 'circle'; center: string; through: string }
  | { shape: 'angle'; at: string; from: string; to: string };

interface BuildsInSteps {
  /** For `reveal` to fill. */
  startsEmpty?: boolean;
}

export interface WriteMath {
  kind: 'writeMath';
  id: ElementId;
  tex: string;
  /** Writes it as that many words pass, so the tutor says it as it forms. */
  overWords?: number;
  claim?: MathClaim;
}

/** Rearranges an equation in place, so matching terms move and keep their identity. */
export interface TransformMath {
  kind: 'transformMath';
  target: ElementId;
  tex: string;
  overWords?: number;
  claim?: MathClaim;
}

/** Marks an element, or one term of an equation when `tex` names the term. */
export interface Highlight {
  kind: 'highlight';
  id: ElementId;
  target: ElementRef;
  tex?: string;
  /** Picks one match of `tex`, counting from 0. */
  occurrence?: number;
}

/** A named value in a plot's expression, such as the `a` in `a*x^2`, which a slider can change. */
export interface PlotConstant {
  name: string;
  value: number;
  min: number;
  max: number;
}

export interface Plot extends BuildsInSteps {
  kind: 'plot';
  id: ElementId;
  expression: string;
  constants?: PlotConstant[];
  domain: [number, number];
  /** Limits what the axes show, so a curve such as 1/x stays readable. */
  yRange?: [number, number];
  label?: string;
  xLabel?: string;
  yLabel?: string;
  /** Draws this curve on the axes of an earlier plot. */
  over?: ElementId;
}

export interface NumberLine {
  kind: 'numberLine';
  id: ElementId;
  domain: [number, number];
}

/** Shades the area under a plot's curve between two x values. */
export interface ShadeArea {
  kind: 'shadeArea';
  id: ElementId;
  target: ElementId;
  from: number;
  to: number;
  label?: string;
}

/** Marks one value on a plot or a number line. */
export interface MarkValue {
  kind: 'markValue';
  id: ElementId;
  target: ElementId;
  at: number;
  label?: string;
}

export interface Geometry {
  kind: 'geometry';
  id: ElementId;
  xRange: [number, number];
  yRange: [number, number];
}

/** Adds one step to a geometry figure. */
export interface Construct {
  kind: 'construct';
  id: ElementId;
  target: ElementId;
  step: GeometryStep;
}

/** Draws a fixed arrow on an element. */
export interface Vector {
  kind: 'vector';
  id: ElementId;
  on: ElementRef;
  angleDegrees: number;
  length: VectorLength;
  label?: string;
}

/** Places a simulation at its first frame, paused, optionally inside a drawing's scale. */
export interface Simulate {
  kind: 'simulate';
  id: ElementId;
  simulation: Simulation;
  over?: ElementId;
}

/** Places a stored, checked scene at its first frame, paused. Its take is data, played by seconds on the board's clock. */
export interface RichScene {
  kind: 'richScene';
  id: ElementId;
  engine: SceneEngine;
  /** Names the stored scene. The browser fetches the take for its own theme. */
  sceneId: string;
  moments: Record<string, number>;
  parts: string[];
  durationSeconds: number;
}

export type SimulationRun =
  /** Stops and holds at `until`. With `overWords` the engine sets the speed so it arrives as that many words pass. With no word to aim at, `rate` sets the speed, where 0.5 is half speed. */
  | { action: 'play'; until?: SimulationPoint; overWords?: number; rate?: number }
  | { action: 'pause' }
  | { action: 'restart' }
  /** Jumps there and holds. */
  | { action: 'seek'; to: SimulationPoint };

export type RunSimulation = { kind: 'runSimulation'; target: ElementId } & SimulationRun;

export type SetParameter = {
  kind: 'setParameter';
  target: ElementId;
  value: number;
} & (
  /** Sets the value and restarts the motion from its first frame. A paused simulation stays still until a later `play`. */
  | { parameter: SimulationParameter }
  /** Reshapes a plot's curve from its current constants to this one, as that many words pass. */
  | { constant: string; overWords?: number }
);

/** Draws an arrow whose length and direction follow a computed quantity. */
export interface TrackVector {
  kind: 'trackVector';
  id: ElementId;
  target: ElementId;
  quantity: TrackedQuantity;
  label?: string;
}

/** Shows a number that follows the simulation, computed each frame and never written by the model. */
export interface Readout {
  kind: 'readout';
  id: ElementId;
  target: ElementId;
  quantity: ReadoutQuantity;
  label?: string;
}

export type Slider = {
  kind: 'slider';
  id: ElementId;
  target: ElementId;
  min: number;
  max: number;
} & (
  | { parameter: SimulationParameter }
  /** Changes a named constant of a plot. */
  | { constant: string }
);

/** Draws the current computed path as a faint line, kept when the student changes a value. */
export interface GhostPath {
  kind: 'ghostPath';
  id: ElementId;
  target: ElementId;
}

/** Shows one of our own drawings, revealed stroke by stroke. */
export interface Drawing {
  kind: 'drawing';
  id: ElementId;
  name: DrawingName;
  labels?: { part: string; text: string }[];
}

export interface Diagram extends BuildsInSteps {
  kind: 'diagram';
  id: ElementId;
  nodes: { name: string; label: string }[];
  edges: { from: string; to: string; label?: string }[];
  handwritten?: boolean;
}

export interface Table extends BuildsInSteps {
  kind: 'table';
  id: ElementId;
  columns: string[];
  rows: string[][];
}

export interface Timeline extends BuildsInSteps {
  kind: 'timeline';
  id: ElementId;
  events: { when: string; label: string }[];
}

export interface CodeBlock extends BuildsInSteps {
  kind: 'code';
  id: ElementId;
  language: string;
  source: string;
}

/** Fills a frame up to a count of nodes, rows, events, or lines, or up to an x value on a plot. */
export interface Reveal {
  kind: 'reveal';
  target: ElementId;
  upTo: number;
  overWords?: number;
}

export type Image = { kind: 'image'; id: ElementId; alt: string } & ({ asset: ImageAsset } | { fileId: FileId });

export interface Text {
  kind: 'text';
  id: ElementId;
  text: string;
  handwritten?: boolean;
  overWords?: number;
}

export interface Annotate {
  kind: 'annotate';
  id: ElementId;
  target: ElementRef;
  mark: AnnotationMark;
  label?: string;
}

/** A few words in the tutor's pen beside an element. */
export interface Note {
  kind: 'note';
  id: ElementId;
  target: ElementId;
  text: string;
}

/** Shows the slope where the student's point sits on a curve, and rides along as they drag. */
export interface Tangent {
  kind: 'tangent';
  id: ElementId;
  target: ElementId;
}

export const TASK_WAYS = ['write', 'pick', 'place', 'drag'] as const;
export type TaskWay = (typeof TASK_WAYS)[number];

export const WRITE_READINGS = ['words', 'code'] as const;
export type WriteReading = (typeof WRITE_READINGS)[number];

export const DRAG_SEEKS = ['flat', 'zero'] as const;
export type DragSeek = (typeof DRAG_SEEKS)[number];

/**
 * Asks the student to do something, in any subject. Whatever the tutor gives as the answer lets code check the work. With no answer, the tutor reads the work and says only what it can stand behind.
 */
export type Task = { kind: 'task'; id: ElementId } & (
  /** Type lines of working, an answer, or code. `on` names the math line they work from. `accepts` holds short answers code may count as right. A line that matches none is not wrong. `byHand` opens the pen for them. */
  | { way: 'write'; on?: ElementId; reads?: WriteReading; accepts?: string[]; byHand?: boolean }
  /** Pick parts of something on the board: terms of a math line or nodes of a diagram. */
  | { way: 'pick'; on: ElementId; answer?: string[] }
  /** Put an item in each slot, which covers steps in order, matching, and labels. `answer` holds the right item for each slot, in slot order. */
  | { way: 'place'; items: string[]; slots: string[]; answer?: string[] }
  /** Drag a point along a plot's curve. `seek` names what code looks for on that curve. */
  | { way: 'drag'; on: ElementId; seek?: DragSeek }
);

export const BOARD_MODES = ['teach', 'handsOn'] as const;
export type BoardModeName = (typeof BOARD_MODES)[number];

/** What the right side of the session is for. Teaching gives it to the visual, and hands-on gives it to the board, with the visual small in the corner. It lands on a word. */
export interface BoardMode {
  kind: 'boardMode';
  mode: BoardModeName;
}

/** Moves the dot to the element under discussion. */
export interface Focus {
  kind: 'focus';
  target: ElementRef;
}

export interface Hide {
  kind: 'hide';
  target: ElementId;
}

export interface ClearBoard {
  kind: 'clearBoard';
}

export type SceneCommand =
  | WriteMath
  | TransformMath
  | Highlight
  | Plot
  | ShadeArea
  | NumberLine
  | MarkValue
  | Geometry
  | Construct
  | Vector
  | Simulate
  | RichScene
  | RunSimulation
  | SetParameter
  | TrackVector
  | Readout
  | Slider
  | GhostPath
  | Drawing
  | Diagram
  | Table
  | Timeline
  | CodeBlock
  | Reveal
  | Image
  | Text
  | Annotate
  | Note
  | Tangent
  | Task
  | BoardMode
  | Focus
  | Hide
  | ClearBoard;
