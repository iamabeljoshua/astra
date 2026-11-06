import { BEAT_LIMITS } from './beat.ts';
import { readElementId, readElementRef, readFileId, readMomentName, readPartName, readSceneId } from './ids.ts';
import { COMMAND_MAX_BYTES } from './live-message.ts';
import { getTexProblem, hasTooLongMarkRun } from './math-tex.ts';
import { isReservedPlotName, parsePlotExpression, PLOT_EXPRESSION_MAX_CHARACTERS } from './plot-expression.ts';
import {
  checkJsonSize,
  checkRangeWidth,
  fail,
  type CheckedFields,
  getField,
  type ParseResult,
  type Place,
  readBoolean,
  readFields,
  readList,
  readNumberInRange,
  readOneOf,
  readRange,
  readString,
  readVariant,
  readWholeNumberInRange,
  toParseResult,
  type VariantTable,
} from './read.ts';
import {
  ANNOTATION_MARKS,
  BOARD_MODES,
  MATH_CLAIMS,
  type Diagram,
  DRAWING_PARTS,
  type DrawingName,
  DRAWINGS,
  type Drawing,
  type GeometryStep,
  IMAGE_ASSETS,
  type PlotConstant,
  READOUT_QUANTITIES,
  SCENE_ENGINES,
  type SceneCommand,
  SIMULATION_MODELS,
  SIMULATION_PARAMETER_RULES,
  SIMULATION_PARAMETERS,
  DRAG_SEEKS,
  type Simulation,
  type DrawShape,
  type SketchMotion,
  type SketchPiece,
  type SketchPlacement,
  SKETCH_ANCHORS,
  SKETCH_DIRECTIONS,
  SKETCH_GAPS,
  SKETCH_SIDES,
  SKETCH_TILT_SIDES,
  SKETCH_SIZES,
  SKETCH_SOLIDS,
  SKETCH_SPOTS,
  SKETCH_STROKES,
  type SimulationModel,
  type SimulationParameter,
  type SimulationParameterRule,
  type SimulationPoint,
  type SimulationRun,
  type Task,
  type Timeline,
  TRACKED_QUANTITIES,
  VECTOR_LENGTHS,
  WRITE_READINGS,
} from './scene-command.ts';

const LIMITS = {
  tex: 500,
  expression: PLOT_EXPRESSION_MAX_CHARACTERS,
  label: 80,
  alt: 200,
  text: 400,
  source: 2000,
  codeLines: 40,
  columns: 8,
  rows: 12,
  events: 12,
  nodes: 12,
  note: 48,
  taskChoices: 12,
  taskChoice: 80,
  edges: 20,
  plotConstants: 4,
  sceneMoments: 24,
  sceneParts: 24,
  sketchText: 32,
  sketchThrough: 6,
} as const;

const NUMBER_RANGES = {
  coordinate: { min: -1e6, max: 1e6 },
  angleDegrees: { min: -360, max: 360 },
  simulationSeconds: { min: 0, max: 3600 },
  sceneDuration: { min: 0.1, max: 600 },
  occurrence: { min: 0, max: LIMITS.tex - 1 },
  overWords: { min: 1, max: BEAT_LIMITS.words },
  playRate: { min: 0.1, max: 4 },
  turns: { min: 0.25, max: 6 },
  swings: { min: 0.5, max: 8 },
} as const;

const CODE_LANGUAGE = /^[a-z0-9+#-]{1,20}$/;
const CONTROL_CHARACTER = /\p{Cc}/u;
const PLOT_CONSTANT_NAME = /^[a-z]{1,8}$/;
/** What JSON makes of a lone backslash, as in beta, frac, nu, rho, and theta. */
const BROKEN_BACKSLASH = /[\b\f\n\r\t]/;
export const RAW_MATH = /\\[a-zA-Z]{2,}|\\[()[\]]|[_^]\{|(?<!\$)\$\$[^$\s]|(?<![\w$])\$(?![\d.,]+\$)[^$\s](?:[^$]*[^$\s])?\$(?![\w$])/;

function readWords(place: Place, maxLength: number): string {
  if (typeof place.value === 'string' && BROKEN_BACKSLASH.test(place.value)) fail(place, 'text with no control or bidi characters, with math in writeMath and each of its backslashes doubled');
  const words = readString(place, maxLength);
  if (hasTooLongMarkRun(words)) fail(place, 'text with no stacks of combining marks');
  if (RAW_MATH.test(words)) fail(place, 'plain words, with math in writeMath');
  return words;
}

function readLabel(place: Place): string {
  return readWords(place, LIMITS.label);
}

function readCodeSource(place: Place): string {
  const source = readString(place, LIMITS.source);
  if (hasTooLongMarkRun(source)) fail(place, 'code with no stacks of combining marks');
  if (source.split('\n').length > LIMITS.codeLines) fail(place, `at most ${LIMITS.codeLines} lines`);
  return source;
}

// JSON turns "\frac" into a form feed and "\theta" into a tab, so a control character means the math is already broken.
function readTex(place: Place): string {
  if (typeof place.value === 'string' && CONTROL_CHARACTER.test(place.value)) fail(place, 'math with no control characters');
  const tex = readString(place, LIMITS.tex);
  const problem = getTexProblem(tex);
  if (problem !== null) fail(place, problem);
  return tex;
}

function readExpression(place: Place, constantNames: ReadonlySet<string>): string {
  const expression = readString(place, LIMITS.expression);
  if (parsePlotExpression(expression, constantNames) === null) fail(place, 'an expression in x with known functions and an explicit *');
  return expression;
}

function readCoordinate(place: Place): number {
  return readNumberInRange(place, NUMBER_RANGES.coordinate);
}

function readAxisRange(place: Place): [number, number] {
  return readRange(place, NUMBER_RANGES.coordinate);
}

function readPlotConstantName(place: Place): string {
  if (typeof place.value !== 'string' || !PLOT_CONSTANT_NAME.test(place.value) || isReservedPlotName(place.value) || Object.hasOwn(SIMULATION_PARAMETER_RULES, place.value)) fail(place, 'a short lowercase name for a constant, and not one a flight uses');
  return place.value;
}

function checkMoreThanMin(place: Place, min: number, max: number): void {
  if (min >= max) fail(place, 'a number above min');
  checkRangeWidth(place, min, max);
}

function readPlotConstant(place: Place): PlotConstant {
  const fields = readFields(place, ['name', 'value', 'min', 'max']);
  const min = readCoordinate(fields.at('min'));
  const max = readCoordinate(fields.at('max'));
  checkMoreThanMin(fields.at('max'), min, max);
  return { name: readPlotConstantName(fields.at('name')), value: readNumberInRange(fields.at('value'), { min, max }), min, max };
}

function readPlotConstants(place: Place): PlotConstant[] {
  const constants = readList(place, { maxLength: LIMITS.plotConstants, readItem: readPlotConstant });
  if (new Set(constants.map(({ name }) => name)).size !== constants.length) fail(place, 'each constant name once');
  return constants;
}

export function readConstantSliderTarget(fields: CheckedFields) {
  return { constant: readPlotConstantName(fields.at('constant')) };
}

export function readConstantValue(place: Place): number {
  return readCoordinate(place);
}

export function readRevealPoint(place: Place): number {
  return readCoordinate(place);
}

export function readSimulationSeconds(place: Place): number {
  return readNumberInRange(place, NUMBER_RANGES.simulationSeconds);
}

export function readParameterValue(place: Place, parameter: SimulationParameter): number {
  return readNumberInRange(place, SIMULATION_PARAMETER_RULES[parameter]);
}

function readLanguage(place: Place): string {
  if (typeof place.value !== 'string' || !CODE_LANGUAGE.test(place.value)) fail(place, 'a code language name');
  return place.value;
}

const readMathClaim = (place: Place) => readOneOf(place, MATH_CLAIMS);

function readOverWords(place: Place): number {
  return readWholeNumberInRange(place, NUMBER_RANGES.overWords);
}

function readSimulationPoint(place: Place): SimulationPoint {
  return typeof place.value === 'number' ? readSimulationSeconds(place) : readMomentName(place);
}

function readSceneMoments(place: Place, durationSeconds: number): Record<string, number> {
  if (typeof place.value !== 'object' || place.value === null || Array.isArray(place.value)) fail(place, 'an object of moments');
  const names = Object.keys(place.value);
  if (names.length > LIMITS.sceneMoments) fail(place, `at most ${LIMITS.sceneMoments} moments`);
  const fields = readFields(place, names);
  return Object.fromEntries(names.map((name) => [readMomentName({ value: name, path: `${place.path}.${name}` }), readNumberInRange(fields.at(name), { min: 0, max: durationSeconds })]));
}

function readParameter(place: Place, rule: SimulationParameterRule): number {
  return place.value === undefined && rule.default !== undefined ? rule.default : readNumberInRange(place, rule);
}

function readParameters(place: Place, model: SimulationModel): Simulation['parameters'] {
  const rules: Record<string, SimulationParameterRule> = SIMULATION_MODELS[model].parameters;
  const fields = readFields(place, Object.keys(rules));
  const values = Object.entries(rules).map(([name, rule]) => [name, readParameter(fields.at(name), rule)]);
  return Object.fromEntries(values) as Simulation['parameters'];
}

function readSimulation(place: Place): Simulation {
  const fields = readFields(place, ['model', 'parameters']);
  const model = readOneOf(fields.at('model'), Object.keys(SIMULATION_MODELS) as SimulationModel[]);
  return { model, parameters: readParameters(fields.at('parameters'), model) };
}

const RUN_COMMAND_KEYS = ['kind', 'target'];

const SIMULATION_RUNS: VariantTable<SimulationRun, 'action'> = {
  tag: 'action',
  variants: {
    play: {
      keys: [...RUN_COMMAND_KEYS, 'until', 'overWords', 'rate'],
      read: (fields) => {
        if (fields.at('overWords').value !== undefined && fields.at('rate').value !== undefined) fail(fields.place, 'either overWords or a rate');
        return { action: 'play', ...fields.optional('until', readSimulationPoint), ...fields.optional('overWords', readOverWords), ...fields.optional('rate', (place) => readNumberInRange(place, NUMBER_RANGES.playRate)) };
      },
    },
    pause: { keys: RUN_COMMAND_KEYS, read: () => ({ action: 'pause' }) },
    restart: { keys: RUN_COMMAND_KEYS, read: () => ({ action: 'restart' }) },
    seek: {
      keys: [...RUN_COMMAND_KEYS, 'to'],
      read: (fields) => ({ action: 'seek', to: readSimulationPoint(fields.at('to')) }),
    },
  },
};

const GEOMETRY_STEPS: VariantTable<GeometryStep, 'shape'> = {
  tag: 'shape',
  variants: {
    point: {
      keys: ['name', 'x', 'y'],
      read: (fields) => ({ shape: 'point', name: readPartName(fields.at('name')), x: readCoordinate(fields.at('x')), y: readCoordinate(fields.at('y')) }),
    },
    segment: {
      keys: ['from', 'to'],
      read: (fields) => ({ shape: 'segment', from: readPartName(fields.at('from')), to: readPartName(fields.at('to')) }),
    },
    circle: {
      keys: ['center', 'through'],
      read: (fields) => ({ shape: 'circle', center: readPartName(fields.at('center')), through: readPartName(fields.at('through')) }),
    },
    angle: {
      keys: ['at', 'from', 'to'],
      read: (fields) => ({ shape: 'angle', at: readPartName(fields.at('at')), from: readPartName(fields.at('from')), to: readPartName(fields.at('to')) }),
    },
  },
};

interface FilledListRules<Item> {
  name: string;
  maxLength: number;
  readItem: (item: Place) => Item;
}

function readFilledList<Item>(fields: CheckedFields, { name, maxLength, readItem }: FilledListRules<Item>): Item[] {
  const items = readList(fields.at(name), { maxLength, readItem });
  if (items.length === 0 && fields.at('startsEmpty').value !== true) fail(fields.at(name), 'at least one item, unless startsEmpty is true');
  return items;
}

function readDrawingLabel(place: Place, name: DrawingName): NonNullable<Drawing['labels']>[number] {
  const fields = readFields(place, ['part', 'text']);
  const parts: readonly string[] = DRAWING_PARTS[name];
  if (parts.length === 0) fail(fields.at('part'), 'no label, because this drawing has no named parts');
  return { part: readOneOf(fields.at('part'), parts), text: readLabel(fields.at('text')) };
}

function readDiagramNode(place: Place): Diagram['nodes'][number] {
  const fields = readFields(place, ['name', 'label']);
  return { name: readPartName(fields.at('name')), label: readLabel(fields.at('label')) };
}

function readEdgeEnd(place: Place, nodeNames: ReadonlySet<string>): string {
  const name = readPartName(place);
  if (!nodeNames.has(name)) fail(place, 'a node of this diagram');
  return name;
}

function readDiagramNodes(fields: CheckedFields): Diagram['nodes'] {
  const nodes = readFilledList(fields, { name: 'nodes', maxLength: LIMITS.nodes, readItem: readDiagramNode });
  if (new Set(nodes.map((node) => node.name)).size !== nodes.length) fail(fields.at('nodes'), 'each node name once');
  return nodes;
}

const isBlankOrNullLabel = (value: unknown) => value === null || (typeof value === 'string' && value.trim() === '');

function readDiagramEdge(place: Place, nodeNames: ReadonlySet<string>): Diagram['edges'][number] {
  const fields = readFields(place, ['from', 'to', 'label']);
  return { from: readEdgeEnd(fields.at('from'), nodeNames), to: readEdgeEnd(fields.at('to'), nodeNames), ...(isBlankOrNullLabel(fields.at('label').value) ? {} : fields.optional('label', readLabel)) };
}

function readDrawingName(place: Place): DrawingName {
  if (!DRAWINGS.includes(place.value as DrawingName)) fail(place, `one of ${DRAWINGS.filter((name) => DRAWING_PARTS[name].length > 0).join(', ')}`);
  return place.value as DrawingName;
}

// A model sometimes adds a kind to an event, which means nothing here and is no reason to lose a whole timeline.
function readTimelineEvent(place: Place): Timeline['events'][number] {
  const fields = readFields(place, ['when', 'label', 'kind']);
  return { when: readLabel(fields.at('when')), label: readLabel(fields.at('label')) };
}

const readTableWords = (place: Place) => (isBlankOrNullLabel(place.value) ? '' : readLabel(place));

function readTableRow(place: Place): string[] {
  return readList(place, { maxLength: LIMITS.columns, readItem: readTableWords });
}

function readTableCells(fields: CheckedFields): { columns: string[]; rows: string[][] } {
  const columns = readFilledList(fields, { name: 'columns', maxLength: LIMITS.columns, readItem: readTableWords });
  const rows = readFilledList(fields, { name: 'rows', maxLength: LIMITS.rows, readItem: readTableRow });
  if (rows.some((row) => row.length !== columns.length)) fail(fields.at('rows'), `${columns.length} cells in each row`);
  return { columns, rows };
}

function readSliderBounds(fields: CheckedFields, readValue: (place: Place) => number): { min: number; max: number } {
  const min = readValue(fields.at('min'));
  const max = readValue(fields.at('max'));
  checkMoreThanMin(fields.at('max'), min, max);
  return { min, max };
}

function readSliderTarget(fields: CheckedFields) {
  const hasConstant = fields.at('constant').value !== undefined;
  if (hasConstant === (fields.at('parameter').value !== undefined)) fail(fields.place, 'either a parameter or a constant');
  if (hasConstant) return { constant: readPlotConstantName(fields.at('constant')), ...readSliderBounds(fields, readCoordinate) };
  const parameter = readOneOf(fields.at('parameter'), SIMULATION_PARAMETERS);
  return { parameter, ...readSliderBounds(fields, (place) => readParameterValue(place, parameter)) };
}

function readImageSource(fields: CheckedFields) {
  const hasAsset = fields.at('asset').value !== undefined;
  if (hasAsset === (fields.at('fileId').value !== undefined)) fail(fields.place, 'either an asset or a fileId');
  return hasAsset ? { asset: readOneOf(fields.at('asset'), IMAGE_ASSETS) } : { fileId: readFileId(fields.at('fileId')) };
}

function readChoice(place: Place): string {
  return readString(place, LIMITS.taskChoice);
}

function readChoices(place: Place): string[] {
  return readList(place, { maxLength: LIMITS.taskChoices, readItem: readChoice });
}

function readDistinctChoices(place: Place): string[] {
  const choices = readChoices(place);
  if (choices.length === 0 || new Set(choices).size !== choices.length) fail(place, 'at least one choice, each different');
  return choices;
}

function readPlaceAnswer(fields: CheckedFields, items: readonly string[], slots: readonly string[]): { answer?: string[] } {
  const { answer } = fields.optional('answer', readChoices);
  if (answer === undefined) return {};
  if (answer.length !== slots.length || !answer.every((item) => items.includes(item))) fail(fields.at('answer'), 'one of the items for each slot');
  return { answer };
}

const TASKS: VariantTable<Task, 'way'> = {
  tag: 'way',
  variants: {
    write: {
      keys: ['kind', 'id', 'on', 'reads', 'accepts', 'byHand'],
      read: (fields) => ({
        kind: 'task',
        id: readElementId(fields.at('id')),
        way: 'write',
        ...fields.optional('byHand', readBoolean),
        ...fields.optional('on', readElementId),
        ...fields.optional('reads', (place) => readOneOf(place, WRITE_READINGS)),
        ...fields.optional('accepts', readDistinctChoices),
      }),
    },
    pick: {
      keys: ['kind', 'id', 'on', 'answer'],
      read: (fields) => ({ kind: 'task', id: readElementId(fields.at('id')), way: 'pick', on: readElementId(fields.at('on')), ...fields.optional('answer', readDistinctChoices) }),
    },
    place: {
      keys: ['kind', 'id', 'items', 'slots', 'answer'],
      read: (fields) => {
        const items = readDistinctChoices(fields.at('items'));
        const slots = readDistinctChoices(fields.at('slots'));
        return { kind: 'task', id: readElementId(fields.at('id')), way: 'place', items, slots, ...readPlaceAnswer(fields, items, slots) };
      },
    },
    drag: {
      keys: ['kind', 'id', 'on', 'seek'],
      read: (fields) => ({ kind: 'task', id: readElementId(fields.at('id')), way: 'drag', on: readElementId(fields.at('on')), ...fields.optional('seek', (place) => readOneOf(place, DRAG_SEEKS)) }),
    },
  },
};

const SKETCH_RELATIONS = ['on', 'above', 'below', 'leftOf', 'rightOf', 'inside'] as const;
const PLACEMENT_KEYS = ['at', ...SKETCH_RELATIONS, 'gap', 'side'];
const PIECE_KEYS = ['kind', 'id', 'target', 'label', 'pen', 'shape'];
const STROKE_KEYS = ['from', 'to', 'toward', 'length'];
const SPOT_NAMES: ReadonlySet<string> = new Set(SKETCH_SPOTS);
const ANCHOR_NAMES: ReadonlySet<string> = new Set(SKETCH_ANCHORS);
const TAKES_A_GAP: ReadonlySet<string> = new Set(['above', 'below', 'leftOf', 'rightOf']);
const TAKES_A_SIDE: ReadonlySet<string> = new Set(['on', 'above', 'below']);
const SHAPES = [...SKETCH_SOLIDS, 'phase', ...SKETCH_STROKES, 'curve'] as const;

function readPieceId(place: Place) {
  const id = readElementId(place);
  if (SPOT_NAMES.has(id)) fail(place, 'a piece name that is not a spot name');
  return id;
}

function readSketchEnd(place: Place): string {
  if (typeof place.value === 'string' && SPOT_NAMES.has(place.value)) return place.value;
  const [piece, anchor, ...rest] = typeof place.value === 'string' ? place.value.split('.') : [];
  if (piece === undefined || rest.length > 0 || (anchor !== undefined && !ANCHOR_NAMES.has(anchor))) fail(place, `a spot, a piece, or a piece and one of ${SKETCH_ANCHORS.join(', ')}, as "table.right"`);
  readPieceId({ value: piece, path: place.path });
  return place.value as string;
}

function readSketchPlacement(fields: CheckedFields): SketchPlacement {
  const relations = SKETCH_RELATIONS.filter((key) => fields.at(key).value !== undefined);
  const hasSpot = fields.at('at').value !== undefined;
  if (relations.length + Number(hasSpot) > 1) fail(fields.place, 'at most one of at, on, above, below, leftOf, rightOf, inside');
  const [relation] = relations;
  const gap = fields.optional('gap', (place) => readOneOf(place, SKETCH_GAPS));
  const side = fields.optional('side', (place) => readOneOf(place, SKETCH_SIDES));
  if (gap.gap !== undefined && !(relation && TAKES_A_GAP.has(relation))) fail(fields.at('gap'), 'gap only with above, below, leftOf, or rightOf');
  if (side.side !== undefined && !(relation && TAKES_A_SIDE.has(relation))) fail(fields.at('side'), 'side only with on, above, or below');
  if (relation === undefined) return fields.optional('at', (place) => readOneOf(place, SKETCH_SPOTS));
  return { [relation]: readPieceId(fields.at(relation)), ...gap, ...side } as SketchPlacement;
}

function readStrokeEnds(fields: CheckedFields) {
  const { from, to } = { ...fields.optional('from', readSketchEnd), ...fields.optional('to', readSketchEnd) };
  const toward = fields.optional('toward', (place) => readOneOf(place, SKETCH_DIRECTIONS));
  const length = fields.optional('length', (place) => readOneOf(place, VECTOR_LENGTHS));
  const endCount = Number(from !== undefined) + Number(to !== undefined);
  if (toward.toward === undefined ? endCount !== 2 : endCount !== 1) fail(fields.place, 'from and to, or one of them with toward');
  if (length.length !== undefined && toward.toward === undefined) fail(fields.at('length'), 'length only with toward');
  return { ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }), ...toward, ...length };
}

function readSketchPiece(place: Place): SketchPiece {
  const shape = readOneOf(getField(place, 'shape'), SHAPES);
  if (shape === 'curve') {
    const fields = readFields(place, [...PIECE_KEYS, 'through']);
    const through = readList(fields.at('through'), { maxLength: LIMITS.sketchThrough, readItem: readSketchEnd });
    if (through.length < 2) fail(fields.at('through'), 'at least 2 ends');
    return { shape, through };
  }
  if ((SKETCH_STROKES as readonly string[]).includes(shape)) return { shape, ...readStrokeEnds(readFields(place, [...PIECE_KEYS, ...STROKE_KEYS])) } as SketchPiece;
  if (shape === 'label') {
    const fields = readFields(place, [...PIECE_KEYS, ...PLACEMENT_KEYS, 'text']);
    return { shape, text: readWords(fields.at('text'), LIMITS.sketchText), ...readSketchPlacement(fields) };
  }
  if (shape === 'phase') {
    const fields = readFields(place, [...PIECE_KEYS, ...PLACEMENT_KEYS, 'of', 'seenFrom']);
    return { shape, of: readPieceId(fields.at('of')), seenFrom: readPieceId(fields.at('seenFrom')), ...readSketchPlacement(fields) };
  }
  const fields = readFields(place, [...PIECE_KEYS, ...PLACEMENT_KEYS, 'size', ...(shape === 'ball' ? ['lit'] : [])]);
  const size = fields.optional('size', (sizePlace) => readOneOf(sizePlace, SKETCH_SIZES));
  const lit = shape === 'ball' ? fields.optional('lit', readPieceId) : {};
  return { shape, ...size, ...lit, ...readSketchPlacement(fields) } as SketchPiece;
}

function readDrawShape(fields: CheckedFields): DrawShape {
  return {
    kind: 'drawShape',
    id: readPieceId(fields.at('id')),
    target: readElementId(fields.at('target')),
    ...fields.optional('label', readLabel),
    ...fields.optional('pen', readBoolean),
    ...readSketchPiece(fields.place),
  } as DrawShape;
}

const ANIMATE_KEYS = ['kind', 'target', 'overWords'];
const readTurns = (place: Place) => readNumberInRange(place, NUMBER_RANGES.turns);

const SKETCH_MOTION_READERS: VariantTable<SketchMotion, 'motion'> = {
  tag: 'motion',
  variants: {
    rollOff: { keys: ANIMATE_KEYS, read: () => ({ motion: 'rollOff' }) },
    fall: { keys: ANIMATE_KEYS, read: () => ({ motion: 'fall' }) },
    along: { keys: [...ANIMATE_KEYS, 'path'], read: (fields) => ({ motion: 'along', path: readPieceId(fields.at('path')) }) },
    orbit: { keys: [...ANIMATE_KEYS, 'around', 'turns'], read: (fields) => ({ motion: 'orbit', around: readPieceId(fields.at('around')), ...fields.optional('turns', readTurns) }) },
    swing: { keys: [...ANIMATE_KEYS, 'around', 'swings'], read: (fields) => ({ motion: 'swing', around: readPieceId(fields.at('around')), ...fields.optional('swings', (place) => readNumberInRange(place, NUMBER_RANGES.swings)) }) },
    spin: { keys: [...ANIMATE_KEYS, 'turns'], read: (fields) => ({ motion: 'spin', ...fields.optional('turns', readTurns) }) },
    tilt: { keys: [...ANIMATE_KEYS, 'around', 'toward'], read: (fields) => ({ motion: 'tilt', around: readPieceId(fields.at('around')), toward: readOneOf(fields.at('toward'), SKETCH_TILT_SIDES) }) },
    grow: { keys: ANIMATE_KEYS, read: () => ({ motion: 'grow' }) },
    pulse: { keys: ANIMATE_KEYS, read: () => ({ motion: 'pulse' }) },
    fade: { keys: ANIMATE_KEYS, read: () => ({ motion: 'fade' }) },
  },
};

const COMMANDS: VariantTable<SceneCommand, 'kind'> = {
  tag: 'kind',
  variants: {
    writeMath: {
      keys: ['id', 'tex', 'overWords', 'claim'],
      read: (fields) => ({ kind: 'writeMath', id: readElementId(fields.at('id')), tex: readTex(fields.at('tex')), ...fields.optional('overWords', readOverWords), ...fields.optional('claim', readMathClaim) }),
    },
    transformMath: {
      keys: ['target', 'tex', 'overWords', 'claim'],
      read: (fields) => ({ kind: 'transformMath', target: readElementId(fields.at('target')), tex: readTex(fields.at('tex')), ...fields.optional('overWords', readOverWords), ...fields.optional('claim', readMathClaim) }),
    },
    highlight: {
      keys: ['id', 'target', 'tex', 'occurrence'],
      read: (fields) => ({
        kind: 'highlight',
        id: readElementId(fields.at('id')),
        target: readElementRef(fields.at('target')),
        ...fields.optional('tex', readTex),
        ...fields.optional('occurrence', (place) => readWholeNumberInRange(place, NUMBER_RANGES.occurrence)),
      }),
    },
    plot: {
      keys: ['id', 'expression', 'constants', 'domain', 'yRange', 'label', 'xLabel', 'yLabel', 'over', 'startsEmpty'],
      read: (fields) => {
        const constants = fields.optional('constants', readPlotConstants);
        return {
          kind: 'plot',
          id: readElementId(fields.at('id')),
          expression: readExpression(fields.at('expression'), new Set(constants.constants?.map(({ name }) => name))),
          ...constants,
          domain: readAxisRange(fields.at('domain')),
          ...fields.optional('yRange', readAxisRange),
          ...fields.optional('label', readLabel),
          ...fields.optional('xLabel', readLabel),
          ...fields.optional('yLabel', readLabel),
          ...fields.optional('over', readElementId),
          ...fields.optional('startsEmpty', readBoolean),
        };
      },
    },
    shadeArea: {
      keys: ['id', 'target', 'from', 'to', 'label'],
      read: (fields) => {
        const from = readCoordinate(fields.at('from'));
        const to = readCoordinate(fields.at('to'));
        if (from >= to) fail(fields.at('to'), 'a number above from');
        return { kind: 'shadeArea', id: readElementId(fields.at('id')), target: readElementId(fields.at('target')), from, to, ...fields.optional('label', readLabel) };
      },
    },
    numberLine: {
      keys: ['id', 'domain'],
      read: (fields) => ({ kind: 'numberLine', id: readElementId(fields.at('id')), domain: readAxisRange(fields.at('domain')) }),
    },
    markValue: {
      keys: ['id', 'target', 'at', 'label'],
      read: (fields) => ({
        kind: 'markValue',
        id: readElementId(fields.at('id')),
        target: readElementId(fields.at('target')),
        at: readCoordinate(fields.at('at')),
        ...fields.optional('label', readLabel),
      }),
    },
    geometry: {
      keys: ['id', 'xRange', 'yRange'],
      read: (fields) => ({
        kind: 'geometry',
        id: readElementId(fields.at('id')),
        xRange: readAxisRange(fields.at('xRange')),
        yRange: readAxisRange(fields.at('yRange')),
      }),
    },
    construct: {
      keys: ['id', 'target', 'step'],
      read: (fields) => ({
        kind: 'construct',
        id: readElementId(fields.at('id')),
        target: readElementId(fields.at('target')),
        step: readVariant<GeometryStep>(fields.at('step'), GEOMETRY_STEPS),
      }),
    },
    sketch: {
      keys: ['id', 'label'],
      read: (fields) => ({ kind: 'sketch', id: readElementId(fields.at('id')), ...fields.optional('label', readLabel) }),
    },
    drawShape: {
      keys: [...PIECE_KEYS.slice(1), ...PLACEMENT_KEYS, ...STROKE_KEYS, 'size', 'lit', 'text', 'through', 'of', 'seenFrom'],
      read: readDrawShape,
    },
    animate: {
      keys: ['target', 'overWords', 'motion', 'path', 'around', 'turns', 'swings', 'toward'],
      read: (fields) => ({ kind: 'animate', target: readPieceId(fields.at('target')), ...fields.optional('overWords', readOverWords), ...readVariant<SketchMotion>(fields.place, SKETCH_MOTION_READERS) }),
    },
    vector: {
      keys: ['id', 'on', 'angleDegrees', 'length', 'label'],
      read: (fields) => ({
        kind: 'vector',
        id: readElementId(fields.at('id')),
        on: readElementRef(fields.at('on')),
        angleDegrees: readNumberInRange(fields.at('angleDegrees'), NUMBER_RANGES.angleDegrees),
        length: readOneOf(fields.at('length'), VECTOR_LENGTHS),
        ...fields.optional('label', readLabel),
      }),
    },
    simulate: {
      keys: ['id', 'simulation', 'over'],
      read: (fields) => ({
        kind: 'simulate',
        id: readElementId(fields.at('id')),
        simulation: readSimulation(fields.at('simulation')),
        ...fields.optional('over', readElementId),
      }),
    },
    richScene: {
      keys: ['id', 'engine', 'sceneId', 'moments', 'parts', 'durationSeconds'],
      read: (fields) => {
        const durationSeconds = readNumberInRange(fields.at('durationSeconds'), NUMBER_RANGES.sceneDuration);
        return {
          kind: 'richScene',
          id: readElementId(fields.at('id')),
          engine: readOneOf(fields.at('engine'), SCENE_ENGINES),
          sceneId: readSceneId(fields.at('sceneId')),
          moments: readSceneMoments(fields.at('moments'), durationSeconds),
          parts: readList(fields.at('parts'), { maxLength: LIMITS.sceneParts, readItem: readPartName }),
          durationSeconds,
        };
      },
    },
    runSimulation: {
      keys: ['target', 'action', 'until', 'overWords', 'rate', 'to'],
      read: (fields) => ({
        kind: 'runSimulation',
        target: readElementId(fields.at('target')),
        ...readVariant<SimulationRun>(fields.place, SIMULATION_RUNS),
      }),
    },
    setParameter: {
      keys: ['target', 'parameter', 'constant', 'value', 'overWords'],
      read: (fields) => {
        const target = readElementId(fields.at('target'));
        if (fields.at('constant').value !== undefined) return { kind: 'setParameter', target, constant: readPlotConstantName(fields.at('constant')), value: readCoordinate(fields.at('value')), ...fields.optional('overWords', readOverWords) };
        if (fields.at('overWords').value !== undefined) fail(fields.at('overWords'), 'overWords only with a constant');
        const parameter = readOneOf(fields.at('parameter'), SIMULATION_PARAMETERS);
        return { kind: 'setParameter', target, parameter, value: readParameterValue(fields.at('value'), parameter) };
      },
    },
    trackVector: {
      keys: ['id', 'target', 'quantity', 'label'],
      read: (fields) => ({
        kind: 'trackVector',
        id: readElementId(fields.at('id')),
        target: readElementId(fields.at('target')),
        quantity: readOneOf(fields.at('quantity'), TRACKED_QUANTITIES),
        ...fields.optional('label', readLabel),
      }),
    },
    readout: {
      keys: ['id', 'target', 'quantity', 'label'],
      read: (fields) => ({
        kind: 'readout',
        id: readElementId(fields.at('id')),
        target: readElementId(fields.at('target')),
        quantity: readOneOf(fields.at('quantity'), READOUT_QUANTITIES),
        ...fields.optional('label', readLabel),
      }),
    },
    slider: {
      keys: ['id', 'target', 'parameter', 'constant', 'min', 'max'],
      read: (fields) => ({ kind: 'slider', id: readElementId(fields.at('id')), target: readElementId(fields.at('target')), ...readSliderTarget(fields) }),
    },
    ghostPath: {
      keys: ['id', 'target'],
      read: (fields) => ({ kind: 'ghostPath', id: readElementId(fields.at('id')), target: readElementId(fields.at('target')) }),
    },
    drawing: {
      keys: ['id', 'name', 'labels'],
      read: (fields) => {
        const name = readDrawingName(fields.at('name'));
        return {
          kind: 'drawing',
          id: readElementId(fields.at('id')),
          name,
          ...fields.optional('labels', (labels) => readList(labels, { maxLength: LIMITS.nodes, readItem: (label) => readDrawingLabel(label, name) })),
        };
      },
    },
    diagram: {
      keys: ['id', 'nodes', 'edges', 'handwritten', 'startsEmpty'],
      read: (fields) => {
        const nodes = readDiagramNodes(fields);
        const nodeNames = new Set(nodes.map((node) => node.name));
        return {
          kind: 'diagram',
          id: readElementId(fields.at('id')),
          nodes,
          edges: readList(fields.at('edges'), { maxLength: LIMITS.edges, readItem: (edge) => readDiagramEdge(edge, nodeNames) }),
          ...fields.optional('handwritten', readBoolean),
          ...fields.optional('startsEmpty', readBoolean),
        };
      },
    },
    table: {
      keys: ['id', 'columns', 'rows', 'startsEmpty'],
      read: (fields) => ({
        kind: 'table',
        id: readElementId(fields.at('id')),
        ...readTableCells(fields),
        ...fields.optional('startsEmpty', readBoolean),
      }),
    },
    timeline: {
      keys: ['id', 'events', 'startsEmpty'],
      read: (fields) => ({
        kind: 'timeline',
        id: readElementId(fields.at('id')),
        events: readFilledList(fields, { name: 'events', maxLength: LIMITS.events, readItem: readTimelineEvent }),
        ...fields.optional('startsEmpty', readBoolean),
      }),
    },
    code: {
      keys: ['id', 'language', 'source', 'startsEmpty'],
      read: (fields) => ({
        kind: 'code',
        id: readElementId(fields.at('id')),
        language: readLanguage(fields.at('language')),
        source: readCodeSource(fields.at('source')),
        ...fields.optional('startsEmpty', readBoolean),
      }),
    },
    reveal: {
      keys: ['target', 'upTo', 'overWords'],
      read: (fields) => ({
        kind: 'reveal',
        target: readElementId(fields.at('target')),
        upTo: readRevealPoint(fields.at('upTo')),
        ...fields.optional('overWords', readOverWords),
      }),
    },
    image: {
      keys: ['id', 'asset', 'fileId', 'alt'],
      read: (fields) => ({
        kind: 'image',
        id: readElementId(fields.at('id')),
        alt: readWords(fields.at('alt'), LIMITS.alt),
        ...readImageSource(fields),
      }),
    },
    text: {
      keys: ['id', 'text', 'handwritten', 'overWords'],
      read: (fields) => ({
        kind: 'text',
        id: readElementId(fields.at('id')),
        text: readWords(fields.at('text'), LIMITS.text),
        ...fields.optional('handwritten', readBoolean),
        ...fields.optional('overWords', readOverWords),
      }),
    },
    annotate: {
      keys: ['id', 'target', 'mark', 'label'],
      read: (fields) => ({
        kind: 'annotate',
        id: readElementId(fields.at('id')),
        target: readElementRef(fields.at('target')),
        mark: readOneOf(fields.at('mark'), ANNOTATION_MARKS),
        ...fields.optional('label', readLabel),
      }),
    },
    note: {
      keys: ['id', 'target', 'text'],
      read: (fields) => ({ kind: 'note', id: readElementId(fields.at('id')), target: readElementId(fields.at('target')), text: readString(fields.at('text'), LIMITS.note) }),
    },
    tangent: {
      keys: ['id', 'target'],
      read: (fields) => ({ kind: 'tangent', id: readElementId(fields.at('id')), target: readElementId(fields.at('target')) }),
    },
    task: {
      keys: ['id', 'way', 'on', 'reads', 'accepts', 'byHand', 'answer', 'items', 'slots', 'seek'],
      read: (fields) => readVariant<Task>(fields.place, TASKS),
    },
    boardMode: {
      keys: ['mode'],
      read: (fields) => ({ kind: 'boardMode', mode: readOneOf(fields.at('mode'), BOARD_MODES) }),
    },
    focus: {
      keys: ['target'],
      read: (fields) => ({ kind: 'focus', target: readElementRef(fields.at('target')) }),
    },
    hide: {
      keys: ['target'],
      read: (fields) => ({ kind: 'hide', target: readElementId(fields.at('target')) }),
    },
    clearBoard: {
      keys: [],
      read: () => ({ kind: 'clearBoard' }),
    },
  },
};

export const SCENE_COMMAND_KINDS = Object.keys(COMMANDS.variants) as readonly SceneCommand['kind'][];

export function readSceneCommand(place: Place): SceneCommand {
  checkJsonSize(place, COMMAND_MAX_BYTES);
  return readVariant<SceneCommand>(place, COMMANDS);
}

export function parseSceneCommand(value: unknown): ParseResult<SceneCommand> {
  return toParseResult(() => readSceneCommand({ value, path: 'command' }));
}
