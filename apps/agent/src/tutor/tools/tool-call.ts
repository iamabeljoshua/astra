export type ToolCall =
  | { tool: 'compute'; expression: string; values: Readonly<Record<string, number>> }
  | { tool: 'plotValues'; expression: string; letter: string; from: number; to: number; points: number }
  | { tool: 'findSource'; claim: string };

export type ToolCallParse = { ok: true; call: ToolCall } | { ok: false; problem: string };

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isNumberMap = (value: unknown): value is Record<string, number> => typeof value === 'object' && value !== null && Object.values(value).every(isFiniteNumber);

function parseCompute({ expression, values }: Record<string, unknown>): ToolCallParse {
  if (typeof expression !== 'string' || expression === '') return { ok: false, problem: 'compute needs an expression' };
  if (values !== undefined && !isNumberMap(values)) return { ok: false, problem: 'compute values must be numbers' };
  return { ok: true, call: { tool: 'compute', expression, values: values ?? {} } };
}

function parsePlotValues({ expression, letter, from, to, points }: Record<string, unknown>): ToolCallParse {
  if (typeof expression !== 'string' || typeof letter !== 'string' || !isFiniteNumber(from) || !isFiniteNumber(to) || !isFiniteNumber(points)) return { ok: false, problem: 'plotValues needs an expression, a letter, from, to, and points' };
  return { ok: true, call: { tool: 'plotValues', expression, letter, from, to, points } };
}

function parseFindSource({ claim }: Record<string, unknown>): ToolCallParse {
  return typeof claim === 'string' && claim !== '' ? { ok: true, call: { tool: 'findSource', claim } } : { ok: false, problem: 'findSource needs a claim' };
}

const TOOL_PARSERS: Readonly<Record<string, (fields: Record<string, unknown>) => ToolCallParse>> = { compute: parseCompute, plotValues: parsePlotValues, findSource: parseFindSource };

/** Null means the object is not a tool call at all, so it is read as a board command. */
export function parseToolCall(value: unknown): ToolCallParse | null {
  if (typeof value !== 'object' || value === null || !('tool' in value)) return null;
  const fields = value as Record<string, unknown>;
  const parser = typeof fields.tool === 'string' ? TOOL_PARSERS[fields.tool] : undefined;
  return parser ? parser(fields) : { ok: false, problem: `there is no tool named ${String(fields.tool)}` };
}
