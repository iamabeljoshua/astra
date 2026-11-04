export type ParseResult<Value> = { ok: true; value: Value } | { ok: false; problem: string };

class ParseProblem extends Error {}

export function toParseResult<Value>(read: () => Value): ParseResult<Value> {
  try {
    return { ok: true, value: read() };
  } catch (error) {
    if (error instanceof ParseProblem) return { ok: false, problem: error.message };
    throw error;
  }
}

export interface Place {
  value: unknown;
  path: string;
}

export function fail(place: Place, expected: string): never {
  throw new ParseProblem(`${place.path}: expected ${expected}`);
}

const LONE_SURROGATE = /[\uD800-\uDFFF]/u;
// Code needs tabs and newlines. A bidi override can make text read differently from what it holds.
const UNSAFE_CHARACTER = /(?![\t\n])[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;
const RANGE_LENGTH = 2;
const SMALLEST_RANGE_WIDTH = 1e-6;

// A NUL or a lone surrogate passes JSON.parse, and then Postgres refuses to store it.
export function checkStorableText(text: string, place: Place): void {
  if (text.includes('\u0000') || LONE_SURROGATE.test(text)) fail(place, 'text with no NUL or broken characters');
}

export function readString(place: Place, maxLength: number): string {
  const { value } = place;
  if (typeof value !== 'string' || value.trim() === '') fail(place, 'text');
  if (value.length > maxLength) fail(place, `at most ${maxLength} characters`);
  checkStorableText(value, place);
  if (UNSAFE_CHARACTER.test(value)) fail(place, 'text with no control or bidi characters');
  return value;
}

function readNumber(place: Place): number {
  const { value } = place;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(place, 'a finite number');
  return value;
}

interface NumberRange {
  min: number;
  max: number;
}

export function readNumberInRange(place: Place, { min, max }: NumberRange): number {
  const value = readNumber(place);
  if (value < min || value > max) fail(place, `a number from ${min} to ${max}`);
  return value;
}

export function readWholeNumber(place: Place): number {
  const { value } = place;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(place, 'a whole number of 0 or more');
  return value;
}

export function readWholeNumberInRange(place: Place, { min, max }: NumberRange): number {
  const value = readWholeNumber(place);
  if (value < min || value > max) fail(place, `a whole number from ${min} to ${max}`);
  return value;
}

export function readBoolean(place: Place): boolean {
  const { value } = place;
  if (typeof value !== 'boolean') fail(place, 'true or false');
  return value;
}

export function readOneOf<Option extends string>(place: Place, options: readonly Option[]): Option {
  const { value } = place;
  if (typeof value !== 'string' || !options.includes(value as Option)) fail(place, `one of ${options.join(', ')}`);
  return value as Option;
}

interface ListRules<Item> {
  maxLength: number;
  readItem: (item: Place) => Item;
}

export function readList<Item>(place: Place, { maxLength, readItem }: ListRules<Item>): Item[] {
  const { value, path } = place;
  if (!Array.isArray(value)) fail(place, 'a list');
  if (value.length > maxLength) fail(place, `at most ${maxLength} items`);
  return value.map((item: unknown, index) => readItem({ value: item, path: `${path}[${index}]` }));
}

export function checkRangeWidth(place: Place, low: number, high: number): void {
  if (high - low < SMALLEST_RANGE_WIDTH) fail(place, `a low and a high number at least ${SMALLEST_RANGE_WIDTH} apart`);
}

export function readRange(place: Place, limits: NumberRange): [number, number] {
  const [low, high] = readList(place, { maxLength: RANGE_LENGTH, readItem: (end) => readNumberInRange(end, limits) });
  if (low === undefined || high === undefined) fail(place, `a low and a high number at least ${SMALLEST_RANGE_WIDTH} apart`);
  checkRangeWidth(place, low, high);
  return [low, high];
}

export function getField(place: Place, key: string): Place {
  const { value, path } = place;
  const holdsKey = typeof value === 'object' && value !== null && Object.hasOwn(value, key);
  return { value: holdsKey ? (value as Record<string, unknown>)[key] : undefined, path: `${path}.${key}` };
}

export class CheckedFields {
  readonly place: Place;

  constructor(place: Place) {
    this.place = place;
  }

  at(key: string): Place {
    return getField(this.place, key);
  }

  optional<Key extends string, Value>(key: Key, read: (place: Place) => Value): { [Name in Key]?: Value } {
    const place = this.at(key);
    return (place.value === undefined ? {} : { [key]: read(place) }) as { [Name in Key]?: Value };
  }
}

export function readFields(place: Place, allowedKeys: readonly string[]): CheckedFields {
  const { value, path } = place;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(place, 'an object');
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) throw new ParseProblem(`${path}.${key}: unknown field`);
  }
  return new CheckedFields(place);
}

interface Variant<Value> {
  keys: readonly string[];
  read: (fields: CheckedFields) => Value;
}

/** One reader per member of a tagged union, so a new member fails the build until it has one. */
export interface VariantTable<Union, Tag extends keyof Union & string> {
  tag: Tag;
  variants: { [Name in Union[Tag] & string]: Variant<Extract<Union, Record<Tag, Name>>> };
}

export function readVariant<Union>(place: Place, table: { tag: string; variants: Record<string, Variant<Union>> }): Union {
  const name = readOneOf(getField(place, table.tag), Object.keys(table.variants));
  const { keys, read } = table.variants[name] as Variant<Union>;
  return read(readFields(place, [table.tag, ...keys]));
}

function getJsonBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    // JSON.stringify throws on a value nested too deep, so such a value is refused.
    return Number.POSITIVE_INFINITY;
  }
}

export function checkJsonSize(place: Place, maxBytes: number): void {
  if (getJsonBytes(place.value) > maxBytes) fail(place, `at most ${maxBytes} bytes of JSON`);
}
