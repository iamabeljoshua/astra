import { ALLOWED_TEX_COMMANDS } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { canRenderTex, KATEX_OPTIONS } from '../src/math/tex-check.ts';

const NEEDS_ITS_OWN_SHAPE: Readonly<Record<string, string>> = {
  '\\left': String.raw`\left( x \right)`,
  '\\right': String.raw`\left( x \right)`,
  '\\begin': String.raw`\begin{matrix} x \end{matrix}`,
  '\\end': String.raw`\begin{matrix} x \end{matrix}`,
  '\\limits': String.raw`\sum\limits_{a}^{b}`,
  '\\nolimits': String.raw`\sum\nolimits_{a}^{b}`,
  '\\not': String.raw`x \not= y`,
  '\\big': String.raw`\big( x \big)`,
  '\\Big': String.raw`\Big( x \Big)`,
  '\\bigg': String.raw`\bigg( x \bigg)`,
  '\\Bigg': String.raw`\Bigg( x \Bigg)`,
  '\\bigl': String.raw`\bigl( x \bigr)`,
  '\\bigr': String.raw`\bigl( x \bigr)`,
  '\\Bigl': String.raw`\Bigl( x \Bigr)`,
  '\\Bigr': String.raw`\Bigl( x \Bigr)`,
  '\\biggl': String.raw`\biggl( x \biggr)`,
  '\\biggr': String.raw`\biggl( x \biggr)`,
  '\\Biggl': String.raw`\Biggl( x \Biggr)`,
  '\\Biggr': String.raw`\Biggl( x \Biggr)`,
  '\\substack': String.raw`\sum_{\substack{a \\ b}} x`,
};

function getSample(command: string): string {
  return NEEDS_ITS_OWN_SHAPE[command] ?? `${command}{a}{b}`;
}

describe('the commands the scene language lets through', () => {
  it.each([...ALLOWED_TEX_COMMANDS])('%s is one KaTeX can set, so a dead name cannot reach a student as a refusal', (command) => {
    expect(canRenderTex(getSample(command))).toBe(true);
  });
});

describe('canRenderTex', () => {
  it('refuses a tree too deep to lay out, with no DOM to measure it on', () => {
    expect(canRenderTex(`x${'\u0301'.repeat(200)}`)).toBe(false);
  });

  it('refuses a tree too large to paint', () => {
    expect(canRenderTex(`\\begin{matrix}${'&'.repeat(470)}\\end{matrix}`)).toBe(false);
  });

  it('still takes the deepest nesting the parser lets through', () => {
    expect(canRenderTex(`${String.raw`\overset{a}{`.repeat(12)}x${'}'.repeat(12)}`)).toBe(true);
  });
});

describe('the options math is set with', () => {
  it.each([
    [String.raw`\href{https://example.com}{x}`, '<a '],
    [String.raw`\htmlClass{hostile}{x}`, 'hostile"'],
    [String.raw`\includegraphics{https://example.com/a.png}`, '<img'],
  ])('build nothing a page would follow or load from %s', (tex, built) => {
    expect(katex.renderToString(tex, KATEX_OPTIONS)).not.toContain(built);
  });
});
