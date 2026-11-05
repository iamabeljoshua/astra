import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPartCatalogue, getUsableParts, type PartApprovals, readPartApprovals, writePartApproval } from '../src/scenes/recipe/catalogue.ts';
import { addRecipeLine, checkRecipe, compileRecipe, createRecipeDraft, getRecipeTiming, type RecipeDraft, type SceneRecipe } from '../src/scenes/recipe/recipe.ts';

const APPROVED_AT = '2026-11-05T10:00:00.000Z';
const HOSTILE_PART_LINE = '{"t":"part","part":"x\\"); alert(1); (\\""}';

const FIT = '{"t":"fit","in":true,"topic":"how a jet engine makes thrust","stage":"studio"}';
const SAYS = [
  '{"t":"say","m":"fan-in","text":"So this is the jet engine, and all the air comes in through that big fan."}',
  '{"t":"say","m":"squeeze","text":"Those stages squeeze the air hard, which means it gets hot before any fuel joins."}',
  '{"t":"say","m":"burn","text":"Fuel burns in that squeezed air, so the hot gas rushes out of the back."}',
  '{"t":"say","m":"push","text":"That fast gas going backwards is what pushes the whole engine forwards."}',
];
const ENGINE = '{"t":"part","id":"engine","part":"jetEngine"}';
const ANNOTATIONS = [
  '{"t":"move","item":"engine","motion":"run","on":"fan-in"}',
  '{"t":"move","item":"engine","motion":"thrust","on":"push","speed":1}',
  '{"t":"label","text":"Fan","at":"engine.fan","show":"fan-in","hide":"squeeze"}',
  '{"t":"label","text":"Combustor","sub":"fuel burns here","at":"engine.combustor","show":"burn"}',
  '{"t":"flow","from":"engine.fan","to":"engine.nozzle","show":"fan-in","color":"#ffcc94"}',
  '{"t":"arrow","from":[2,0,0],"to":"engine.thrust","show":"push"}',
  '{"t":"gauge","label":"Speed","unit":"km/s","min":0,"max":12,"from":0,"to":11,"on":"push","over":4}',
  '{"t":"cam","on":"fan-in","look":"engine.fan","view":"front","zoom":1}',
  '{"t":"cam","on":"burn","look":"engine.combustor","zoom":1.4}',
];
const WHOLE_REPLY = [FIT, ...SAYS, ENGINE, ...ANNOTATIONS];

function readReply(lines: readonly string[]): RecipeDraft {
  const draft = createRecipeDraft();
  for (const line of lines) addRecipeLine(draft, line);
  return draft;
}

function getChecked(lines: readonly string[]) {
  const checked = checkRecipe(readReply(lines), getPartCatalogue());
  if (!checked.isOk) throw new Error(`refused: ${checked.problems.join('; ')}`);
  return checked;
}

function getHash(name: string): string {
  const part = getPartCatalogue().get(name);
  if (!part) throw new Error(`no part ${name}`);
  return part.hash;
}

const getApprovals = (...names: string[]): PartApprovals => Object.fromEntries(names.map((name) => [name, { hash: getHash(name), approvedAt: APPROVED_AT }]));

const FAKE_CORE = 'function runRecipe(kit, recipe, options) { return { recipe, options }; }';

function runCompiled(recipe: SceneRecipe, drawsFlat = false) {
  const alert = vi.fn();
  const code = compileRecipe(recipe, { core: FAKE_CORE, parts: getPartCatalogue() });
  const scene = new Function('PART', 'window', 'alert', `${code}\nreturn scene;`)(() => {}, { __drawFlat: drawsFlat }, alert) as (kit: object) => { recipe: SceneRecipe; options: { flat: boolean } };
  return { ...scene({}), alert, code };
}

describe('reading a model reply line by line', () => {
  it('reads a whole reply with nothing unread', () => {
    const draft = readReply(WHOLE_REPLY);
    expect(draft.unreadLines).toBe(0);
    expect(draft.fit).toEqual({ kind: 'fits', topic: 'how a jet engine makes thrust', stage: 'studio' });
    expect(draft.says.map(({ m }) => m)).toEqual(['fan-in', 'squeeze', 'burn', 'push']);
    expect(draft.items).toStrictEqual([{ id: 'engine', part: 'jetEngine' }]);
    expect(draft.arrows).toStrictEqual([{ from: [2, 0, 0], to: 'engine.thrust', show: 'push' }]);
  });

  it('passes over blank lines and code fences without counting them', () => {
    const draft = readReply(['```json', '', '   ', ...SAYS.slice(0, 1), '```']);
    expect(draft.says).toHaveLength(1);
    expect(draft.unreadLines).toBe(0);
  });

  it.each([
    ['prose', 'Here is your recipe:'],
    ['a line cut off mid-stream', '{"t":"say","m":"fan-in","te'],
    ['a line that is not an object', 'null'],
    ['a kind no reader knows', '{"t":"script","code":"alert(1)"}'],
    ['a kind with no name', '{"m":"fan-in","text":"All the air comes in."}'],
    ['a kind named after a built-in', '{"t":"constructor"}'],
  ])('counts %s as unread and adds nothing', (_what, line) => {
    const draft = readReply([line]);
    expect(draft).toEqual({ ...createRecipeDraft(), unreadLines: 1 });
  });

  it.each([
    ['fit', '{"t":"fit","in":true,"topic":"jet engine","stage":"studio","code":"alert(1)"}', (draft: RecipeDraft) => draft.fit, { kind: 'fits', topic: 'jet engine', stage: 'studio' }],
    ['say', '{"t":"say","m":"fan-in","text":"All the air comes in.","onstart":"alert(1)"}', (draft: RecipeDraft) => draft.says[0], { m: 'fan-in', text: 'All the air comes in.' }],
    ['part', '{"t":"part","id":"engine","part":"jetEngine","build":"alert(1)","source":"alert(1)"}', (draft: RecipeDraft) => draft.items[0], { id: 'engine', part: 'jetEngine' }],
    ['move', '{"t":"move","item":"engine","motion":"run","on":"fan-in","update":"alert(1)"}', (draft: RecipeDraft) => draft.moves[0], { item: 'engine', motion: 'run', on: 'fan-in' }],
    ['label', '{"t":"label","text":"Fan","at":"engine.fan","show":"fan-in","side":"left","html":"<b>"}', (draft: RecipeDraft) => draft.labels[0], { text: 'Fan', at: 'engine.fan', show: 'fan-in' }],
    ['arrow', '{"t":"arrow","from":"engine.fan","to":"engine.nozzle","show":"fan-in","radius":9}', (draft: RecipeDraft) => draft.arrows[0], { from: 'engine.fan', to: 'engine.nozzle', show: 'fan-in' }],
    ['flow', '{"t":"flow","from":"engine.fan","to":"engine.nozzle","show":"fan-in","count":9000}', (draft: RecipeDraft) => draft.flows[0], { from: 'engine.fan', to: 'engine.nozzle', show: 'fan-in' }],
    ['gauge', '{"t":"gauge","label":"Speed","min":0,"max":12,"from":0,"to":11,"on":"push","format":"alert(1)"}', (draft: RecipeDraft) => draft.gauges[0], { label: 'Speed', min: 0, max: 12, from: 0, to: 11, on: 'push' }],
    ['cam', '{"t":"cam","on":"fan-in","look":"engine.fan","distance":900}', (draft: RecipeDraft) => draft.cams[0], { on: 'fan-in', look: 'engine.fan' }],
  ])('lets no unknown key past on a %s line', (_kind, line, getWritten, expected) => {
    expect(getWritten(readReply([line]))).toStrictEqual(expected);
  });

  it.each([
    ['as a model could write it', HOSTILE_PART_LINE],
    ['with an id beside it', '{"t":"part","id":"engine","part":"x\\"); alert(1); (\\""}'],
  ])('refuses a part name that is code, %s', (_how, line) => {
    const draft = readReply([line]);
    expect(draft.items).toEqual([]);
    expect(draft.unreadLines).toBe(1);
  });

  it('keeps an object arg only when all its keys are moments', () => {
    const [item] = readReply(['{"t":"part","id":"gears","part":"gearTrain","args":{"story":{"fan-in":"open","burn":"close"},"badKey":{"Not A Moment":"open"},"nested":{"fan-in":{"deep":"open"}},"teeth":[12,36],"preset":"mars","isCut":true,"tooMany":null}}']).items;
    expect(item?.args).toStrictEqual({ story: { 'fan-in': 'open', burn: 'close' }, teeth: [12, 36], preset: 'mars', isCut: true });
  });

  it('lets no arg set what a part reads through a __proto__ key', () => {
    const lines = [FIT, ...SAYS, '{"t":"part","id":"world","part":"planet","args":{"__proto__":{"preset":"mars"}}}'];
    const { recipe } = runCompiled(getChecked(lines).recipe);
    expect((recipe.items[0]?.args as Record<string, unknown> | undefined)?.preset).toBeUndefined();
  });

  it('carries the reason a reply gives for not fitting', () => {
    const draft = readReply(['{"t":"fit","in":false,"topic":"how a bee flies","why":"no part shows a bee"}']);
    expect(draft.fit).toEqual({ kind: 'noFit', topic: 'how a bee flies', why: 'no part shows a bee' });
  });
});

describe('checking a recipe against the parts', () => {
  it('passes a good reply with nothing dropped', () => {
    const { recipe, dropped } = getChecked(WHOLE_REPLY);
    expect(dropped).toEqual([]);
    expect(recipe.items).toStrictEqual([{ id: 'engine', part: 'jetEngine' }]);
    expect(recipe.moves.map(({ motion }) => motion)).toEqual(['run', 'thrust']);
    expect(recipe.labels.map(({ text }) => text)).toEqual(['Fan', 'Combustor']);
    expect(recipe.cams).toHaveLength(2);
  });

  it.each([
    ['a part that does not exist', [FIT, ...SAYS, '{"t":"part","id":"suit","part":"wingSuit"}'], 'wingSuit'],
    ['the same item twice', [FIT, ...SAYS, '{"t":"part","id":"world","part":"planet"}', '{"t":"part","id":"world","part":"sunStar"}'], 'world'],
    ['one spoken line', [FIT, ...SAYS.slice(0, 1), ENGINE], 'spoken'],
    ['no parts', [FIT, ...SAYS], 'parts'],
    ['no fit line', [...SAYS, ENGINE], 'fit'],
    ['a reply that says it does not fit', ['{"t":"fit","in":false,"topic":"how a bee flies","why":"no part shows a bee"}', ...SAYS, ENGINE], 'fit'],
  ])('refuses %s', (_what, lines, named) => {
    const checked = checkRecipe(readReply(lines), getPartCatalogue());
    expect(checked).toMatchObject({ isOk: false, problems: expect.arrayContaining([expect.stringContaining(named)]) });
  });

  it('refuses a part that is real but not approved', () => {
    const checked = checkRecipe(readReply(WHOLE_REPLY), getUsableParts({ canUseUnapproved: false, approvals: getApprovals('planet') }));
    expect(checked).toMatchObject({ isOk: false, problems: [expect.stringContaining('jetEngine')] });
  });

  it.each([
    ['a label at an anchor the part does not have', '{"t":"label","text":"Exhaust","at":"engine.exhaust","show":"burn"}'],
    ['a label on an item that is not there', '{"t":"label","text":"Wing","at":"wing","show":"burn"}'],
    ['a label on a moment nobody says', '{"t":"label","text":"Shaft","at":"engine.shaft","show":"later"}'],
    ['a label with too many words', '{"t":"label","text":"The very big spinning fan","at":"engine.fan","show":"burn"}'],
    ['a label with a web address', '{"t":"label","text":"nasa.gov","at":"engine.fan","show":"burn"}'],
    ['an arrow from an anchor the part does not have', '{"t":"arrow","from":"engine.exhaust","to":"engine.thrust","show":"push"}'],
    ['an arrow on a moment nobody says', '{"t":"arrow","from":"engine.fan","to":"engine.thrust","show":"later"}'],
    ['a flow to an anchor the part does not have', '{"t":"flow","from":"engine.fan","to":"engine.exhaust","show":"push"}'],
    ['a camera at an anchor the part does not have', '{"t":"cam","on":"burn","look":"engine.exhaust"}'],
    ['a gauge on a moment nobody says', '{"t":"gauge","label":"Heat","min":0,"max":9,"from":0,"to":9,"on":"later"}'],
    ['a move the part does not have', '{"t":"move","item":"engine","motion":"fly","on":"burn"}'],
    ['a move named after a built-in', '{"t":"move","item":"engine","motion":"constructor","on":"burn"}'],
  ])('drops %s and keeps the rest', (_what, line) => {
    const { recipe, dropped } = getChecked([...WHOLE_REPLY, line]);
    expect(recipe).toEqual(getChecked(WHOLE_REPLY).recipe);
    expect(dropped).toHaveLength(1);
  });

  it('takes off a hide on a moment nobody says and keeps the label', () => {
    const { recipe } = getChecked([FIT, ...SAYS, ENGINE, '{"t":"label","text":"Fan","at":"engine.fan","show":"burn","hide":"later"}']);
    expect(recipe.labels).toStrictEqual([{ text: 'Fan', at: 'engine.fan', show: 'burn' }]);
  });

  it('keeps a whole-scene part alone, along with what pointed at what it replaced', () => {
    const { recipe, dropped } = getChecked([FIT, ...SAYS, '{"t":"part","id":"star","part":"sunStar"}', '{"t":"part","id":"engine","part":"jetEngine","in":"burn"}', '{"t":"label","text":"Sun","at":"star","show":"fan-in"}', '{"t":"label","text":"Fan","at":"engine.fan","show":"burn"}']);
    expect(recipe.items).toStrictEqual([{ id: 'engine', part: 'jetEngine' }]);
    expect(recipe.labels.map(({ text }) => text)).toEqual(['Fan']);
    expect(dropped.join(' ')).toContain('sunStar');
  });

  it('lets parts that share a stage stand together, on the stage of the first part', () => {
    const { recipe } = getChecked(['{"t":"fit","in":true,"topic":"a planet and its star","stage":"studio"}', ...SAYS, '{"t":"part","id":"star","part":"sunStar","in":"fan-in"}', '{"t":"part","id":"world","part":"planet","in":"burn","at":[3,0,0]}']);
    expect(recipe.stage).toBe('space');
    expect(recipe.items).toStrictEqual([{ id: 'star', part: 'sunStar' }, { id: 'world', part: 'planet', in: 'burn', at: [3, 0, 0] }]);
  });

  it('drops a label on an item that has not come on stage by then', () => {
    const { recipe, dropped } = getChecked([FIT, ...SAYS, '{"t":"part","id":"star","part":"sunStar"}', '{"t":"part","id":"world","part":"planet","in":"burn"}', '{"t":"label","text":"Too soon","at":"world","show":"squeeze"}', '{"t":"label","text":"In time","at":"world","show":"push"}']);
    expect(recipe.labels.map(({ text }) => text)).toEqual(['In time']);
    expect(dropped).toHaveLength(1);
  });
});

describe('timing a recipe', () => {
  it('gives every moment a model can name its time', () => {
    const { moments } = getRecipeTiming([{ m: 'constructor', text: 'A line about the first thing.' }, { m: 'next', text: 'A line about the next thing.' }]);
    expect(Object.keys(moments)).toEqual(['constructor', 'next']);
  });
});

describe('compiling a recipe', () => {
  const hostileWords = '"); alert(1); ("';
  const hostileRecipe = getChecked([FIT, JSON.stringify({ t: 'say', m: 'fan-in', text: hostileWords }), ...SAYS.slice(1), ENGINE, JSON.stringify({ t: 'label', text: hostileWords, at: 'engine.fan', show: 'fan-in' })]).recipe;

  it('holds the recipe only as JSON, so hostile words stay words', () => {
    const { recipe, alert } = runCompiled(hostileRecipe);
    expect(recipe).toEqual(hostileRecipe);
    expect(recipe.says[0]?.text).toBe(hostileWords);
    expect(alert).not.toHaveBeenCalled();
  });

  it('carries only the source of the parts it uses', () => {
    const { code } = runCompiled(hostileRecipe);
    const others = [...getPartCatalogue().values()].filter(({ name }) => name !== 'jetEngine');
    expect(code).toContain(getPartCatalogue().get('jetEngine')?.source);
    expect(others.filter(({ source }) => code.includes(source)).map(({ name }) => name)).toEqual([]);
  });

  it('tells the recipe to draw flat only when the page asks', () => {
    expect(runCompiled(hostileRecipe, true).options.flat).toBe(true);
    expect(runCompiled(hostileRecipe, false).options.flat).toBe(false);
  });
});

describe('which parts are usable', () => {
  const folders: string[] = [];

  function makeFolder(): string {
    const folder = mkdtempSync(join(tmpdir(), 'part-approvals-'));
    folders.push(folder);
    return folder;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('node:fs');
    vi.resetModules();
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });

  it('leaves an unapproved part out without the switch', () => {
    const usable = getUsableParts({ canUseUnapproved: false, approvals: getApprovals('planet') });
    expect([...usable.keys()]).toEqual(['planet']);
  });

  it('opens every part with the switch', () => {
    const usable = getUsableParts({ canUseUnapproved: true, approvals: {} });
    expect([...usable.keys()]).toEqual([...getPartCatalogue().keys()]);
  });

  it('reads the switch from the one environment value', () => {
    vi.stubEnv('ASTRA_FAST_SCENES_ANY_PART', '');
    expect(getUsableParts({ approvals: {} }).size).toBe(0);
    vi.stubEnv('ASTRA_FAST_SCENES_ANY_PART', '1');
    expect(getUsableParts({ approvals: {} }).size).toBe(getPartCatalogue().size);
  });

  it('saves an approval and takes it back', () => {
    const folder = makeFolder();
    writePartApproval({ name: 'planet', isApproved: true, folder, atIso: APPROVED_AT });
    expect(readPartApprovals(folder)).toEqual(getApprovals('planet'));
    writePartApproval({ name: 'planet', isApproved: false, folder });
    expect(readPartApprovals(folder)).toEqual({});
  });

  it('will not approve a part that does not exist', () => {
    const folder = makeFolder();
    expect(() => writePartApproval({ name: 'wingSuit', isApproved: true, folder })).toThrow('wingSuit');
    expect(readPartApprovals(folder)).toEqual({});
  });

  it('takes back the approval of a part whose code was edited, and only that one', async () => {
    const folder = makeFolder();
    writePartApproval({ name: 'gearTrain', isApproved: true, folder, atIso: APPROVED_AT });
    writePartApproval({ name: 'planet', isApproved: true, folder, atIso: APPROVED_AT });
    const approvals = readPartApprovals(folder);
    vi.resetModules();
    vi.doMock('node:fs', async (getOriginal) => {
      const fs = await getOriginal<typeof import('node:fs')>();
      const readFileSync = (path: string, encoding: BufferEncoding) => `${fs.readFileSync(path, encoding)}${path.endsWith('gears.js') ? '\n// edited\n' : ''}`;
      return { ...fs, readFileSync };
    });
    const edited = await import('../src/scenes/recipe/catalogue.ts');
    expect([...edited.getUsableParts({ canUseUnapproved: false, approvals }).keys()]).toEqual(['planet']);
  });
});
