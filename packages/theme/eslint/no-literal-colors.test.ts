import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: fileURLToPath(new URL('../../..', import.meta.url)) });

async function getLintRules(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.map((message) => message.ruleId) ?? [];
}

const COMPONENT_PATH = 'apps/web/src/Example.tsx';
const STYLESHEET_PATH = 'apps/web/src/example.css';
const LITERAL_COLOR_RULE = 'theme/no-literal-colors';

describe('the literal color check in pnpm lint', () => {
  it.each([
    ['a hex class', `<i className="bg-[#fff]" />`],
    ['a hex style', `<i style={{ color: '#1B1815' }} />`],
    ['a color function', `<i style={{ background: 'rgb(0, 0, 0)' }} />`],
    ['a modern color function', `<i style={{ color: 'oklch(0.5 0.1 200)' }} />`],
    ['a template string', '<i style={{ border: `1px solid #000` }} />'],
    ['a named color style', `<i style={{ color: 'red' }} />`],
    ['a named color in a shorthand', `<i style={{ border: '1px solid tomato' }} />`],
    ['a named color class', `<i className="bg-[red]" />`],
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
    ['the Tailwind imports', "@import 'tailwindcss';\n@import '@astra/theme/theme.css';"],
  ])('allows %s in a stylesheet', async (_name, code) => {
    expect(await getLintRules(code, STYLESHEET_PATH)).not.toContain(LITERAL_COLOR_RULE);
  });
});
