import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

// The first lint loads the whole config, which takes longer than the default 5 seconds when other test runs share the machine.
vi.setConfig({ testTimeout: 30_000 });

const eslint = new ESLint({ cwd: fileURLToPath(new URL('../../..', import.meta.url)) });

async function getLintRules(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.map((message) => message.ruleId) ?? [];
}

const COMPONENT_PATH = 'apps/web/src/Example.tsx';
const STRINGS_PATH = 'apps/web/src/strings.ts';
const STYLESHEET_PATH = 'apps/web/src/example.css';
const LITERAL_COLOR_RULE = 'theme/no-literal-colors';
const APP_TEXT_RULE = 'no-restricted-syntax';

describe('the literal color check in pnpm lint', () => {
  it.each([
    ['a hex class', `<i className="bg-[#fff]" />`],
    ['a hex style', `<i style={{ color: '#1B1815' }} />`],
    ['a color function', `<i style={{ background: 'rgb(0, 0, 0)' }} />`],
    ['a modern color function', `<i style={{ color: 'oklch(0.5 0.1 200)' }} />`],
    ['a template string', '<i style={{ border: `1px solid #000` }} />'],
    ['a named color style', `<i style={{ color: 'red' }} />`],
    ['a named color class', `<i className="bg-[red]" />`],
    ['a hex color followed by an underscore', `<i className="shadow-[0_0_4px_#000_inset]" />`],
    ['a hex-like value that is not an href', `<i style={{ color: '#add' }} />`],
    ['an SVG fill', `<circle fill="black" />`],
    ['an SVG stroke', `<path stroke="#000" />`],
  ])('rejects %s in a component', async (_name, element) => {
    const rules = await getLintRules(`export const Example = () => ${element};\n`, COMPONENT_PATH);
    expect(rules).toContain(LITERAL_COLOR_RULE);
  });

  it.each([
    ['a token class', `<i className="bg-panel text-ink-2 border-line" />`],
    ['a token variable', `<i style={{ color: 'var(--color-ink)' }} />`],
    ['currentColor', `<circle fill="currentColor" stroke="none" />`],
    ['copy that names a color', `<i title="The red planet" />`],
    ['a size in brackets', `<i className="text-[11px] grid-cols-[216px_1fr]" />`],
    ['copy under a color property', `({ outline: 'Why the sky is blue' })`],
    ['a word on the object prototype', `({ outline: 'constructor' })`],
    ['an href to a page anchor', `<a href="#add" />`],
    ['an href in braces', `<a href={'#add'} />`],
    ['an href in a template', '<a href={`#add-${id}`} />'],
    ['an href that picks between anchors', `<a href={isNew ? '#add' : '#fed'} />`],
    ['an href in an object', `({ href: '#add' })`],
  ])('allows %s in a component', async (_name, element) => {
    const rules = await getLintRules(`export const Example = () => ${element};\n`, COMPONENT_PATH);
    expect(rules).not.toContain(LITERAL_COLOR_RULE);
  });

  it.each([
    ['a hex color', '.example { color: #fff; }'],
    ['a color function', '.example { background: rgba(0, 0, 0, 0.5); }'],
    ['a named color', '.example { border: 1px solid red; }'],
  ])('rejects %s in a stylesheet', async (_name, code) => {
    expect(await getLintRules(code, STYLESHEET_PATH)).toContain(LITERAL_COLOR_RULE);
  });

  it.each([
    ['a token', '.example { color: var(--color-ink); }'],
    ['a word on the object prototype', '.example { outline: constructor; }'],
    ['the Tailwind imports', "@import 'tailwindcss';\n@import '@astra/theme/theme.css';"],
  ])('allows %s in a stylesheet', async (_name, code) => {
    expect(await getLintRules(code, STYLESHEET_PATH)).not.toContain(LITERAL_COLOR_RULE);
  });
});

describe('the files the literal color check skips', () => {
  it.each([
    ['copy with a number sign in strings.ts', `export const LABELS = { lesson: 'Lesson #100' };\n`, STRINGS_PATH],
    ['a color in a test file', `export const EXPECTED = 'rgb(27, 24, 21)';\n`, 'apps/web/src/Example.test.ts'],
    ['a color in a component test file', `export const EXPECTED = '#000';\n`, 'apps/web/src/Example.test.tsx'],
  ])('allows %s', async (_name, code, filePath) => {
    expect(await getLintRules(code, filePath)).not.toContain(LITERAL_COLOR_RULE);
  });

  it('still rejects the same copy in any other file', async () => {
    const rules = await getLintRules(`export const LABELS = { lesson: 'Lesson #100' };\n`, 'apps/web/src/example.ts');
    expect(rules).toContain(LITERAL_COLOR_RULE);
  });
});

describe('the app text check in pnpm lint', () => {
  it.each([
    ['text in a component', `<p>Hello</p>`],
    ['text with a letter outside English', `<p>Ṣade</p>`],
    ['text with a letter and a number', `<p>{count} left</p>`],
    ['an aria-label', `<i aria-label="Close" />`],
    ['an image description', `<img alt="A cat" />`],
  ])('rejects %s', async (_name, element) => {
    const rules = await getLintRules(`export const Example = () => ${element};\n`, COMPONENT_PATH);
    expect(rules).toContain(APP_TEXT_RULE);
  });

  it.each([
    ['a decorative image', `<img alt="" />`],
    ['a slash between values', `<span>{first} / {second}</span>`],
    ['a percent sign after a value', `<span>{share}%</span>`],
    ['a separator dot', `<span>·</span>`],
  ])('allows %s', async (_name, element) => {
    const rules = await getLintRules(`export const Example = () => ${element};\n`, COMPONENT_PATH);
    expect(rules).not.toContain(APP_TEXT_RULE);
  });
});
