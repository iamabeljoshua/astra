import type { PartCatalogue, PartDefinition } from './catalogue.ts';

const MOST_SAYS = 8;
const FEWEST_SAYS = 2;
const MOST_LINE_CHARACTERS = 160;
const MOST_REASON_CHARACTERS = 500;
const MOST_LABEL_WORDS = 4;
const MOST_LABEL_CHARACTERS = 40;
const MOST_ITEMS = 6;
const MOST_ANNOTATIONS = 12;
const MOST_ARG_ENTRIES = 8;
const MOST_ARG_CHARACTERS = 40;
const SMALLEST_SIZE = 0.05;
const LARGEST_SIZE = 20;
const MOST_COORDINATE = 500;
const MOMENT_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const ITEM_ID = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const ADDRESS = /[a-z0-9-]\.[a-z]{2,}(\b|\/)|https?:|www\./i;
const STAGES = ['space', 'studio', 'outdoor'] as const;
const NOMINAL_CHARACTERS_PER_SECOND = 15;
const SECONDS_AFTER_LAST_WORD = 1.6;
const TIME_DECIMALS = 2;

export type RecipeStage = (typeof STAGES)[number];
export type Point = readonly [number, number, number];
/** An item's id, or `item.anchor`, or a place in the scene. */
export type RecipeTarget = string | Point;

export interface RecipeLine {
  m: string;
  text: string;
}

/** Numbers, short words, or moment ids naming a part's own keys. Parts read these as plain values. */
export type RecipeArg = string | number | boolean | readonly number[] | Readonly<Record<string, string>>;

export interface RecipeItem {
  id: string;
  part: string;
  at?: Point;
  size?: number;
  args?: Readonly<Record<string, RecipeArg>>;
  in?: string;
  out?: string;
}

export interface RecipeMove {
  item: string;
  motion: string;
  on: string;
  off?: string;
  speed?: number;
  over?: number;
}

export interface RecipeLabel {
  text: string;
  sub?: string;
  at: string;
  show: string;
  hide?: string;
}

export interface RecipeArrow {
  from: RecipeTarget;
  to: RecipeTarget;
  show: string;
  hide?: string;
  color?: string;
}

export interface RecipeGauge {
  label: string;
  unit?: string;
  min: number;
  max: number;
  from: number;
  to: number;
  on: string;
  over?: number;
}

export interface RecipeCamera {
  on: string;
  look: string;
  view?: string;
  zoom?: number;
}

/** Everything a scene is, as data. Parts are the only code, and no field here is ever run. */
export interface SceneRecipe {
  topic: string;
  stage: RecipeStage;
  says: readonly RecipeLine[];
  items: readonly RecipeItem[];
  moves: readonly RecipeMove[];
  labels: readonly RecipeLabel[];
  arrows: readonly RecipeArrow[];
  flows: readonly RecipeArrow[];
  gauges: readonly RecipeGauge[];
  cams: readonly RecipeCamera[];
}

export type RecipeFit = { kind: 'unknown' } | { kind: 'fits'; topic: string; stage: RecipeStage } | { kind: 'noFit'; topic: string; why: string };

/** The lines of one streamed reply as they arrive. Nothing here has been checked against the parts yet. */
export interface RecipeDraft {
  fit: RecipeFit;
  says: RecipeLine[];
  items: RecipeItem[];
  moves: RecipeMove[];
  labels: RecipeLabel[];
  arrows: RecipeArrow[];
  flows: RecipeArrow[];
  gauges: RecipeGauge[];
  cams: RecipeCamera[];
  unreadLines: number;
}

export const createRecipeDraft = (): RecipeDraft => ({ fit: { kind: 'unknown' }, says: [], items: [], moves: [], labels: [], arrows: [], flows: [], gauges: [], cams: [], unreadLines: 0 });

type Written = Record<string, unknown>;

const readText = (value: unknown, mostCharacters: number): string | undefined => (typeof value === 'string' && value.trim() !== '' && value.length <= mostCharacters ? value.trim() : undefined);
const readReason = (value: unknown): string => (typeof value === 'string' ? value.trim().slice(0, MOST_REASON_CHARACTERS) : '');
const readMoment = (value: unknown): string | undefined => (typeof value === 'string' && MOMENT_ID.test(value) ? value : undefined);
const readItemId = (value: unknown): string | undefined => (typeof value === 'string' && ITEM_ID.test(value) ? value : undefined);
const readNumber = (value: unknown, lowest = -MOST_COORDINATE, highest = MOST_COORDINATE): number | undefined => (typeof value === 'number' && Number.isFinite(value) && value >= lowest && value <= highest ? value : undefined);
const readPoint = (value: unknown): Point | undefined => (Array.isArray(value) && value.length === 3 && value.every((part) => readNumber(part) !== undefined) ? (value as unknown as Point) : undefined);
const readTarget = (value: unknown): RecipeTarget | undefined => readPoint(value) ?? (typeof value === 'string' && value.length <= MOST_ARG_CHARACTERS ? value : undefined);
const readColor = (value: unknown): string | undefined => (typeof value === 'string' && COLOR.test(value) ? value : undefined);

function withoutEmpty<Shape extends object>(shape: Shape): Shape {
  return Object.fromEntries(Object.entries(shape).filter(([, value]) => value !== undefined)) as Shape;
}

const isPlainObject = (value: unknown): value is Written => typeof value === 'object' && value !== null && !Array.isArray(value);

function readWordsByMoment(value: Written): Readonly<Record<string, string>> | undefined {
  const entries = Object.entries(value).slice(0, MOST_ARG_ENTRIES);
  const isClean = entries.every(([moment, word]) => readMoment(moment) !== undefined && readText(word, MOST_ARG_CHARACTERS) !== undefined);
  return isClean && entries.length > 0 ? (Object.fromEntries(entries) as Record<string, string>) : undefined;
}

function readArg(arg: unknown): RecipeArg | undefined {
  if (typeof arg === 'boolean') return arg;
  if (isPlainObject(arg)) return readWordsByMoment(arg);
  if (Array.isArray(arg)) return arg.length <= MOST_ARG_ENTRIES && arg.every((one) => readNumber(one) !== undefined) ? (arg as number[]) : undefined;
  return readNumber(arg) ?? readText(arg, MOST_ARG_CHARACTERS);
}

function readArgs(value: unknown): RecipeItem['args'] | undefined {
  if (!isPlainObject(value)) return undefined;
  const entries = Object.entries(value).slice(0, MOST_ARG_ENTRIES).flatMap(([name, arg]) => {
    const read = readArg(arg);
    return read === undefined || readItemId(name) === undefined ? [] : [[name, read] as const];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

const readStage = (value: unknown): RecipeStage => (STAGES as readonly unknown[]).includes(value) ? (value as RecipeStage) : 'studio';

function addFit(draft: RecipeDraft, line: Written): void {
  const topic = readText(line.topic, MOST_LINE_CHARACTERS) ?? '';
  draft.fit = line.in === true ? { kind: 'fits', topic, stage: readStage(line.stage) } : { kind: 'noFit', topic, why: readReason(line.why) };
}

function addSay(draft: RecipeDraft, line: Written): boolean {
  const m = readMoment(line.m);
  const text = readText(line.text, MOST_LINE_CHARACTERS);
  if (!m || !text || draft.says.length >= MOST_SAYS) return false;
  draft.says.push({ m, text });
  return true;
}

function addItem(draft: RecipeDraft, line: Written): boolean {
  const id = readItemId(line.id);
  const part = readItemId(line.part);
  if (!id || !part || draft.items.length >= MOST_ITEMS) return false;
  draft.items.push(withoutEmpty({ id, part, at: readPoint(line.at), size: readNumber(line.size, SMALLEST_SIZE, LARGEST_SIZE), args: readArgs(line.args), in: readMoment(line.in), out: readMoment(line.out) }));
  return true;
}

function addMove(draft: RecipeDraft, line: Written): boolean {
  const item = readItemId(line.item);
  const motion = readItemId(line.motion);
  const on = readMoment(line.on);
  if (!item || !motion || !on || draft.moves.length >= MOST_ANNOTATIONS) return false;
  draft.moves.push(withoutEmpty({ item, motion, on, off: readMoment(line.off), speed: readNumber(line.speed, 0.1, 5), over: readNumber(line.over, 0.1, 30) }));
  return true;
}

function addLabel(draft: RecipeDraft, line: Written): boolean {
  const text = readText(line.text, MOST_LABEL_CHARACTERS);
  const at = typeof line.at === 'string' ? line.at : undefined;
  const show = readMoment(line.show);
  if (!text || !at || !show || draft.labels.length >= MOST_ANNOTATIONS) return false;
  draft.labels.push(withoutEmpty({ text, sub: readText(line.sub, MOST_LABEL_CHARACTERS), at, show, hide: readMoment(line.hide) }));
  return true;
}

function addArrowTo(list: RecipeArrow[], line: Written): boolean {
  const from = readTarget(line.from);
  const to = readTarget(line.to);
  const show = readMoment(line.show);
  if (from === undefined || to === undefined || !show || list.length >= MOST_ANNOTATIONS) return false;
  list.push(withoutEmpty({ from, to, show, hide: readMoment(line.hide), color: readColor(line.color) }));
  return true;
}

function addGauge(draft: RecipeDraft, line: Written): boolean {
  const label = readText(line.label, MOST_LABEL_CHARACTERS);
  const [min, max, from, to] = [line.min, line.max, line.from, line.to].map((value) => readNumber(value, -1e12, 1e12));
  const on = readMoment(line.on);
  if (!label || !on || min === undefined || max === undefined || from === undefined || to === undefined || max <= min || draft.gauges.length >= MOST_ANNOTATIONS) return false;
  draft.gauges.push(withoutEmpty({ label, unit: readText(line.unit, MOST_LABEL_CHARACTERS), min, max, from, to, on, over: readNumber(line.over, 0.1, 30) }));
  return true;
}

function addCamera(draft: RecipeDraft, line: Written): boolean {
  const on = readMoment(line.on);
  const look = typeof line.look === 'string' && line.look.length <= MOST_ARG_CHARACTERS ? line.look : undefined;
  if (!on || !look || draft.cams.length >= MOST_ANNOTATIONS) return false;
  draft.cams.push(withoutEmpty({ on, look, view: readItemId(line.view), zoom: readNumber(line.zoom, 0.4, 3) }));
  return true;
}

const LINE_READERS: Readonly<Record<string, (draft: RecipeDraft, line: Written) => boolean>> = {
  fit(draft, line) {
    addFit(draft, line);
    return true;
  },
  say: addSay,
  part: addItem,
  move: addMove,
  label: addLabel,
  arrow: (draft, line) => addArrowTo(draft.arrows, line),
  flow: (draft, line) => addArrowTo(draft.flows, line),
  gauge: addGauge,
  cam: addCamera,
};

/** The boundary. One model line becomes typed data or nothing, and any field it does not list never gets past here. */
export function addRecipeLine(draft: RecipeDraft, rawLine: string): void {
  const line = rawLine.trim();
  if (line === '' || line.startsWith('```')) return;
  try {
    const parsed = JSON.parse(line) as Written;
    const reader = typeof parsed.t === 'string' && Object.hasOwn(LINE_READERS, parsed.t) ? LINE_READERS[parsed.t] : undefined;
    if (!reader || !reader(draft, parsed)) draft.unreadLines += 1;
  } catch {
    draft.unreadLines += 1;
  }
}

export type CheckedRecipe = { isOk: true; recipe: SceneRecipe; dropped: readonly string[] } | { isOk: false; problems: readonly string[]; dropped: readonly string[] };

interface CheckFacts {
  moments: ReadonlySet<string>;
  momentOrder: readonly string[];
  itemParts: ReadonlyMap<string, PartDefinition>;
  items: readonly RecipeItem[];
}

const isKnownTarget = (target: RecipeTarget | undefined, { itemParts }: CheckFacts): boolean => {
  if (target === undefined) return false;
  if (typeof target !== 'string') return true;
  const [itemId, anchor, ...rest] = target.split('.');
  const part = itemParts.get(itemId ?? '');
  return Boolean(part) && rest.length === 0 && (anchor === undefined || (part as PartDefinition).anchors.includes(anchor));
};

function isOnStageBy(target: string, moment: string, { items, momentOrder }: CheckFacts): boolean {
  const entersOn = items.find((item) => item.id === target.split('.')[0])?.in;
  return !entersOn || momentOrder.indexOf(entersOn) <= momentOrder.indexOf(moment);
}

function keepKnownMoment<Shape extends object>(shape: Shape, field: keyof Shape, moments: ReadonlySet<string>): Shape {
  const moment = shape[field];
  if (moment === undefined || moments.has(moment as string)) return shape;
  return Object.fromEntries(Object.entries(shape).filter(([name]) => name !== field)) as Shape;
}

function getWholeSceneItems(items: readonly RecipeItem[], parts: PartCatalogue, dropped: string[]): readonly RecipeItem[] {
  const whole = items.find((item) => parts.get(item.part) && parts.get(item.part)?.alone !== false);
  if (!whole || items.length === 1) return items;
  dropped.push(`${items.filter((item) => item !== whole).map((item) => item.part).join(', ')} beside ${whole.part}, which draws the whole scene`);
  return [whole];
}

function keepItems(items: readonly RecipeItem[], moments: ReadonlySet<string>, parts: PartCatalogue, problems: string[]): RecipeItem[] {
  const seen = new Set<string>();
  return items.flatMap((item, index) => {
    if (!parts.has(item.part)) {
      problems.push(`unknown part ${item.part}`);
      return [];
    }
    if (seen.has(item.id)) {
      problems.push(`item ${item.id} repeats`);
      return [];
    }
    seen.add(item.id);
    const kept = keepKnownMoment(keepKnownMoment(item, 'in', moments), 'out', moments);
    return index === 0 ? [withoutEmpty({ ...kept, in: undefined })] : [kept];
  });
}

function keepWhere<Shape>(list: readonly Shape[], isKept: (one: Shape) => boolean, describe: (one: Shape) => string, dropped: string[]): Shape[] {
  return list.filter((one) => {
    if (isKept(one)) return true;
    dropped.push(describe(one));
    return false;
  });
}

const isLabelWordingFine = ({ text, sub }: RecipeLabel) => text.split(/\s+/).length <= MOST_LABEL_WORDS && !ADDRESS.test(text) && !ADDRESS.test(sub ?? '');

// A bad label or arrow is dropped, because a missing label is safe and a wrong one is not. A wrong main part, or no words, refuses the whole recipe, and anything beside a whole scene is dropped.
export function checkRecipe(draft: RecipeDraft, parts: PartCatalogue): CheckedRecipe {
  const problems: string[] = [];
  const dropped: string[] = [];
  if (draft.fit.kind !== 'fits') return { isOk: false, problems: ['it does not fit any part'], dropped };
  if (draft.says.length < FEWEST_SAYS) problems.push('fewer than two spoken lines');
  if (draft.items.length === 0) problems.push('no parts');
  const moments = new Set(draft.says.map(({ m }) => m));
  const items = keepItems(getWholeSceneItems(draft.items, parts, dropped), moments, parts, problems);
  const itemParts = new Map(items.flatMap((item) => (parts.get(item.part) ? [[item.id, parts.get(item.part) as PartDefinition] as const] : [])));
  const facts: CheckFacts = { moments, momentOrder: draft.says.map(({ m }) => m), itemParts, items };
  const moves = keepWhere(draft.moves, ({ item, motion, on }) => Object.hasOwn(itemParts.get(item)?.motions ?? {}, motion) && moments.has(on), ({ item, motion }) => `move ${motion} on ${item}`, dropped).map((move) => keepKnownMoment(move, 'off', moments));
  const labels = keepWhere(draft.labels, (label) => isKnownTarget(label.at, facts) && moments.has(label.show) && isOnStageBy(label.at, label.show, facts) && isLabelWordingFine(label), ({ text, at }) => `label "${text}" at ${at}`, dropped).map((label) => keepKnownMoment(label, 'hide', moments));
  const keepArrows = (list: readonly RecipeArrow[]) => keepWhere(list, ({ from, to, show }) => isKnownTarget(from, facts) && isKnownTarget(to, facts) && moments.has(show), ({ from, to }) => `arrow from ${String(from)} to ${String(to)}`, dropped).map((arrow) => keepKnownMoment(arrow, 'hide', moments));
  const gauges = keepWhere(draft.gauges, ({ on }) => moments.has(on), ({ label }) => `gauge ${label}`, dropped);
  const cams = keepWhere(draft.cams, ({ on, look }) => moments.has(on) && isKnownTarget(look, facts), ({ look }) => `camera at ${look}`, dropped);
  if (problems.length > 0) return { isOk: false, problems, dropped };
  const { topic, stage } = draft.fit;
  return { isOk: true, dropped, recipe: { topic, stage: parts.get(items[0]?.part ?? '')?.stage ?? stage, says: draft.says, items, moves, labels, arrows: keepArrows(draft.arrows), flows: keepArrows(draft.flows), gauges, cams } };
}

export function getRecipeTiming(says: readonly RecipeLine[]): { moments: Record<string, number>; durationSeconds: number } {
  const moments: Record<string, number> = {};
  let atCharacter = 0;
  const toSeconds = (characters: number) => Number((characters / NOMINAL_CHARACTERS_PER_SECOND).toFixed(TIME_DECIMALS));
  for (const { m, text } of says) {
    if (!Object.hasOwn(moments, m)) moments[m] = toSeconds(atCharacter);
    atCharacter += text.length + 1;
  }
  return { moments, durationSeconds: Number((toSeconds(atCharacter) + SECONDS_AFTER_LAST_WORD).toFixed(TIME_DECIMALS)) };
}

/** Marks each line's moment for the path that turns narration into beats. */
export const getMarkedNarration = (says: readonly RecipeLine[]) => says.map(({ m, text }) => `[[${m}]] ${text}`).join(' ');

/** The approved code a recipe needs, with the recipe as a JSON value in it. `window.__drawFlat` is set by the page that builds the sandbox. */
export function compileRecipe(recipe: SceneRecipe, { core, parts }: { core: string; parts: PartCatalogue }): string {
  const used = [...new Set(recipe.items.map(({ part }) => part))].map((name) => parts.get(name)?.source ?? '');
  return `${core}\n${used.join('\n')}\nfunction scene(kit) { return runRecipe(kit, ${JSON.stringify(recipe)}, { flat: window.__drawFlat === true }); }`;
}
