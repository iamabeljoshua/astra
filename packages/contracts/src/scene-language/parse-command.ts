import { BEAT_LIMITS } from './beat.ts';
import { readElementId, readElementRef, readFileId, readMomentName, readPartName, readSceneId } from './ids.ts';
import { COMMAND_MAX_BYTES } from './live-message.ts';
import { getTexProblem } from './math-tex.ts';
import { isReservedPlotName, parsePlotExpression, PLOT_EXPRESSION_MAX_CHARACTERS } from './plot-expression.ts';
import {
  checkJsonSize,
  fail,
  type CheckedFields,
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
  MATH_CLAIMS,
  type Diagram,
  DRAWINGS,
  type Drawing,
  type GeometryStep,
  IMAGE_ASSETS,
  type PlotConstant,
  SCENE_ENGINES,
  type SceneCommand,
  SIMULATION_MODELS,
  SIMULATION_PARAMETER_RULES,
  SIMULATION_PARAMETERS,
  type Simulation,
  type SimulationModel,
  type SimulationParameter,
  type SimulationParameterRule,
  type SimulationPoint,
  type SimulationRun,
  type Timeline,
  TRACKED_QUANTITIES,
  VECTOR_LENGTHS,
} from './scene-command.ts';

const LIMITS = {
  tex: 500,
  expression: PLOT_EXPRESSION_MAX_CHARACTERS,
  label: 80,
  alt: 200,
  text: 400,
  source: 2000,
  columns: 8,
  rows: 12,
  events: 12,
  nodes: 12,
  edges: 20,
  plotConstants: 4,
  sceneMoments: 24,
  sceneParts: 24,
} as const;

const NUMBER_RANGES = {
  coordinate: { min: -1e6, max: 1e6 },
  angleDegrees: { min: -360, max: 360 },
  simulationSeconds: { min: 0, max: 3600 },
  sceneDuration: { min: 0.1, max: 600 },
  occurrence: { min: 0, max: LIMITS.tex - 1 },
  overWords: { min: 1, max: BEAT_LIMITS.words },
} as const;

const CODE_LANGUAGE = /^[a-z0-9+#-]{1,20}$/;
const CONTROL_CHARACTER = /\p{Cc}/u;
const PLOT_CONSTANT_NAME = /^[a-z]{1,8}$/;

function readLabel(place: Place): string {
  return readString(place, LIMITS.label);
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
  if (typeof place.value !== 'string' || !PLOT_CONSTANT_NAME.test(place.value) || isReservedPlotName(place.value)) fail(place, 'a short lowercase name for a constant');
  return place.value;
}

function readPlotConstant(place: Place): PlotConstant {
  const fields = readFields(place, ['name', 'value', 'min', 'max']);
  const min = readCoordinate(fields.at('min'));
  const max = readCoordinate(fields.at('max'));
  if (min >= max) fail(fields.at('max'), 'a number above min');
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
      keys: [...RUN_COMMAND_KEYS, 'until', 'overWords'],
      read: (fields) => ({ action: 'play', ...fields.optional('until', readSimulationPoint), ...fields.optional('overWords', readOverWords) }),
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

function readDrawingLabel(place: Place): NonNullable<Drawing['labels']>[number] {
  const fields = readFields(place, ['part', 'text']);
  return { part: readPartName(fields.at('part')), text: readLabel(fields.at('text')) };
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

function readDiagramEdge(place: Place, nodeNames: ReadonlySet<string>): Diagram['edges'][number] {
  const fields = readFields(place, ['from', 'to', 'label']);
  return { from: readEdgeEnd(fields.at('from'), nodeNames), to: readEdgeEnd(fields.at('to'), nodeNames), ...fields.optional('label', readLabel) };
}

function readTimelineEvent(place: Place): Timeline['events'][number] {
  const fields = readFields(place, ['when', 'label']);
  return { when: readLabel(fields.at('when')), label: readLabel(fields.at('label')) };
}

function readTableRow(place: Place): string[] {
  return readList(place, { maxLength: LIMITS.columns, readItem: readLabel });
}

function readTableCells(fields: CheckedFields): { columns: string[]; rows: string[][] } {
  const columns = readFilledList(fields, { name: 'columns', maxLength: LIMITS.columns, readItem: readLabel });
  const rows = readFilledList(fields, { name: 'rows', maxLength: LIMITS.rows, readItem: readTableRow });
  if (rows.some((row) => row.length !== columns.length)) fail(fields.at('rows'), `${columns.length} cells in each row`);
  return { columns, rows };
}

function readSliderBounds(fields: CheckedFields, readValue: (place: Place) => number): { min: number; max: number } {
  const min = readValue(fields.at('min'));
  const max = readValue(fields.at('max'));
  if (min >= max) fail(fields.at('max'), 'a number above min');
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
      keys: ['target', 'action', 'until', 'overWords', 'to'],
      read: (fields) => ({
        kind: 'runSimulation',
        target: readElementId(fields.at('target')),
        ...readVariant<SimulationRun>(fields.place, SIMULATION_RUNS),
      }),
    },
    setParameter: {
      keys: ['target', 'parameter', 'value'],
      read: (fields) => {
        const parameter = readOneOf(fields.at('parameter'), SIMULATION_PARAMETERS);
        return { kind: 'setParameter', target: readElementId(fields.at('target')), parameter, value: readParameterValue(fields.at('value'), parameter) };
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
      read: (fields) => ({
        kind: 'drawing',
        id: readElementId(fields.at('id')),
        name: readOneOf(fields.at('name'), DRAWINGS),
        ...fields.optional('labels', (labels) => readList(labels, { maxLength: LIMITS.nodes, readItem: readDrawingLabel })),
      }),
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
        source: readString(fields.at('source'), LIMITS.source),
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
        alt: readString(fields.at('alt'), LIMITS.alt),
        ...readImageSource(fields),
      }),
    },
    text: {
      keys: ['id', 'text', 'handwritten', 'overWords'],
      read: (fields) => ({
        kind: 'text',
        id: readElementId(fields.at('id')),
        text: readString(fields.at('text'), LIMITS.text),
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
