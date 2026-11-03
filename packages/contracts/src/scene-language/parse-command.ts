import { BEAT_LIMITS } from './beat.ts';
import { readElementId, readElementRef, readFileId, readPartName } from './ids.ts';
import { COMMAND_MAX_BYTES } from './live-message.ts';
import {
  checkJsonSize,
  fail,
  type CheckedFields,
  type ParseResult,
  type Place,
  readBoolean,
  readFields,
  readList,
  readNumber,
  readOneOf,
  readRange,
  readString,
  readVariant,
  readWholeNumber,
  toParseResult,
  type VariantTable,
} from './read.ts';
import {
  ANNOTATION_MARKS,
  type Diagram,
  DRAWINGS,
  type Drawing,
  type GeometryStep,
  IMAGE_ASSETS,
  type SceneCommand,
  SIMULATION_MODELS,
  SIMULATION_MOMENTS,
  SIMULATION_PARAMETERS,
  type Simulation,
  type SimulationModel,
  type SimulationPoint,
  type SimulationRun,
  type Timeline,
  TRACKED_QUANTITIES,
  VECTOR_LENGTHS,
} from './scene-command.ts';

const LIMITS = {
  tex: 500,
  expression: 200,
  label: 80,
  alt: 200,
  text: 400,
  source: 2000,
  columns: 8,
  rows: 12,
  events: 12,
  nodes: 12,
  edges: 20,
} as const;

const CODE_LANGUAGE = /^[a-z0-9+#-]{1,20}$/;
const CONTROL_CHARACTER = /\p{Cc}/u;

const EXPRESSION_VALUE = '\\d+(?:\\.\\d+)?|\\.\\d+|x|pi|e|\\)';
const EXPRESSION_FUNCTION = 'sin|cos|tan|exp|ln|log|sqrt|abs';
const EXPRESSION_OPERATOR = '[-+*/^,(]';

// A value cannot touch the next value, so 2x and 2(x) are refused.
const PLOT_EXPRESSION = new RegExp(`^(?: *(?:(?:${EXPRESSION_VALUE})(?! *[\\w.(])|(?:${EXPRESSION_FUNCTION})(?= *\\()|${EXPRESSION_OPERATOR}))+ *$`);

function readLabel(place: Place): string {
  return readString(place, LIMITS.label);
}

// JSON turns "\frac" into a form feed and "\theta" into a tab, so a control character means the math is already broken.
function readTex(place: Place): string {
  const tex = readString(place, LIMITS.tex);
  if (CONTROL_CHARACTER.test(tex)) fail(place, 'math with no control characters');
  return tex;
}

function readExpression(place: Place): string {
  const expression = readString(place, LIMITS.expression);
  if (!PLOT_EXPRESSION.test(expression)) fail(place, 'an expression in x with known functions and an explicit *');
  return expression;
}

function readLanguage(place: Place): string {
  if (typeof place.value !== 'string' || !CODE_LANGUAGE.test(place.value)) fail(place, 'a code language name');
  return place.value;
}

function readOverWords(place: Place): number {
  const words = readWholeNumber(place);
  if (words < 1 || words > BEAT_LIMITS.words) fail(place, `a whole number from 1 to ${BEAT_LIMITS.words}`);
  return words;
}

function readSimulationPoint(place: Place): SimulationPoint {
  if (typeof place.value !== 'number') return readOneOf(place, SIMULATION_MOMENTS);
  const seconds = readNumber(place);
  if (seconds < 0) fail(place, 'simulation seconds of 0 or more');
  return seconds;
}

function readParameters(place: Place, model: SimulationModel): Simulation['parameters'] {
  const { required, defaults } = SIMULATION_MODELS[model];
  const fields = readFields(place, [...required, ...Object.keys(defaults)]);
  const requiredValues = required.map((name) => ({ [name]: readNumber(fields.at(name)) }));
  const givenValues = Object.keys(defaults).map((name) => fields.optional(name, readNumber));
  return Object.assign({}, ...requiredValues, defaults, ...givenValues);
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
      read: (fields) => ({ shape: 'point', name: readPartName(fields.at('name')), x: readNumber(fields.at('x')), y: readNumber(fields.at('y')) }),
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
  const columns = readTableRow(fields.at('columns'));
  const rows = readList(fields.at('rows'), { maxLength: LIMITS.rows, readItem: readTableRow });
  if (rows.some((row) => row.length !== columns.length)) fail(fields.at('rows'), `${columns.length} cells in each row`);
  return { columns, rows };
}

function readSliderBounds(fields: CheckedFields): { min: number; max: number } {
  const min = readNumber(fields.at('min'));
  const max = readNumber(fields.at('max'));
  if (min >= max) fail(fields.at('max'), 'a number above min');
  return { min, max };
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
      keys: ['id', 'tex'],
      read: (fields) => ({ kind: 'writeMath', id: readElementId(fields.at('id')), tex: readTex(fields.at('tex')) }),
    },
    transformMath: {
      keys: ['target', 'tex'],
      read: (fields) => ({ kind: 'transformMath', target: readElementId(fields.at('target')), tex: readTex(fields.at('tex')) }),
    },
    highlight: {
      keys: ['id', 'target', 'tex', 'occurrence'],
      read: (fields) => ({
        kind: 'highlight',
        id: readElementId(fields.at('id')),
        target: readElementRef(fields.at('target')),
        ...fields.optional('tex', readTex),
        ...fields.optional('occurrence', readWholeNumber),
      }),
    },
    plot: {
      keys: ['id', 'expression', 'domain', 'label', 'xLabel', 'yLabel', 'over', 'startsEmpty'],
      read: (fields) => ({
        kind: 'plot',
        id: readElementId(fields.at('id')),
        expression: readExpression(fields.at('expression')),
        domain: readRange(fields.at('domain')),
        ...fields.optional('label', readLabel),
        ...fields.optional('xLabel', readLabel),
        ...fields.optional('yLabel', readLabel),
        ...fields.optional('over', readElementId),
        ...fields.optional('startsEmpty', readBoolean),
      }),
    },
    numberLine: {
      keys: ['id', 'domain'],
      read: (fields) => ({ kind: 'numberLine', id: readElementId(fields.at('id')), domain: readRange(fields.at('domain')) }),
    },
    markValue: {
      keys: ['id', 'target', 'at', 'label'],
      read: (fields) => ({
        kind: 'markValue',
        id: readElementId(fields.at('id')),
        target: readElementId(fields.at('target')),
        at: readNumber(fields.at('at')),
        ...fields.optional('label', readLabel),
      }),
    },
    geometry: {
      keys: ['id', 'xRange', 'yRange'],
      read: (fields) => ({
        kind: 'geometry',
        id: readElementId(fields.at('id')),
        xRange: readRange(fields.at('xRange')),
        yRange: readRange(fields.at('yRange')),
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
        angleDegrees: readNumber(fields.at('angleDegrees')),
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
      read: (fields) => ({
        kind: 'setParameter',
        target: readElementId(fields.at('target')),
        parameter: readOneOf(fields.at('parameter'), SIMULATION_PARAMETERS),
        value: readNumber(fields.at('value')),
      }),
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
      keys: ['id', 'target', 'parameter', 'min', 'max'],
      read: (fields) => ({
        kind: 'slider',
        id: readElementId(fields.at('id')),
        target: readElementId(fields.at('target')),
        parameter: readOneOf(fields.at('parameter'), SIMULATION_PARAMETERS),
        ...readSliderBounds(fields),
      }),
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
        const nodes = readList(fields.at('nodes'), { maxLength: LIMITS.nodes, readItem: readDiagramNode });
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
        events: readList(fields.at('events'), { maxLength: LIMITS.events, readItem: readTimelineEvent }),
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
        upTo: readNumber(fields.at('upTo')),
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
      keys: ['id', 'text', 'handwritten'],
      read: (fields) => ({
        kind: 'text',
        id: readElementId(fields.at('id')),
        text: readString(fields.at('text'), LIMITS.text),
        ...fields.optional('handwritten', readBoolean),
      }),
    },
    annotate: {
      keys: ['id', 'target', 'mark'],
      read: (fields) => ({
        kind: 'annotate',
        id: readElementId(fields.at('id')),
        target: readElementRef(fields.at('target')),
        mark: readOneOf(fields.at('mark'), ANNOTATION_MARKS),
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
