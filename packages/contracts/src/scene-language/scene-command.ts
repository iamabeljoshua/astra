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
  },
} as const satisfies Record<string, { parameters: Record<string, SimulationParameterRule> }>;

type ModelTable = typeof SIMULATION_MODELS;
export type SimulationModel = keyof ModelTable;
type ParameterOf<Model extends SimulationModel> = keyof ModelTable[Model]['parameters'];
export type SimulationParameter = { [Model in SimulationModel]: ParameterOf<Model> }[SimulationModel];

const MODEL_PARAMETERS: Record<string, SimulationParameterRule>[] = Object.values(SIMULATION_MODELS).map(({ parameters }) => parameters);

export const SIMULATION_PARAMETER_RULES = Object.assign({}, ...MODEL_PARAMETERS) as Record<SimulationParameter, SimulationParameterRule>;

export const SIMULATION_PARAMETERS = Object.keys(SIMULATION_PARAMETER_RULES) as SimulationParameter[];

export const TRACKED_QUANTITIES = ['velocity', 'velocity-x', 'velocity-y', 'acceleration'] as const;
export type TrackedQuantity = (typeof TRACKED_QUANTITIES)[number];

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
  /** Stops and holds at `until`. With `overWords` the engine sets the speed so it arrives as that many words pass. */
  | { action: 'play'; until?: SimulationPoint; overWords?: number }
  | { action: 'pause' }
  | { action: 'restart' }
  /** Jumps there and holds. */
  | { action: 'seek'; to: SimulationPoint };

export type RunSimulation = { kind: 'runSimulation'; target: ElementId } & SimulationRun;

/** Sets the value and restarts the motion from its first frame, the same as a slider sample. A paused simulation stays still until a later `play`. */
export interface SetParameter {
  kind: 'setParameter';
  target: ElementId;
  parameter: SimulationParameter;
  value: number;
}

/** Draws an arrow whose length and direction follow a computed quantity. */
export interface TrackVector {
  kind: 'trackVector';
  id: ElementId;
  target: ElementId;
  quantity: TrackedQuantity;
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
  | Focus
  | Hide
  | ClearBoard;
