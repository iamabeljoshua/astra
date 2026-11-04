import { ALLOWED_TEX_COMMANDS, getTexProblem } from '@astra/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import katex from 'katex';
import { buildTexTree, canRenderTex, KATEX_OPTIONS } from '../src/math/tex-check.ts';

// With no call left to build a tree, everything is refused, so a refusal proves nothing until this passes.
beforeEach(() => {
  expect(buildTexTree('x')?.children?.length, 'the KaTeX call the tree limit measures is gone').toBeGreaterThan(0);
});

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

describe('combining marks', () => {
  const ALL_MARKS = Array.from({ length: 0x110000 }, (_, codePoint) => codePoint)
    .filter((codePoint) => codePoint < 0xd800 || codePoint > 0xdfff)
    .map((codePoint) => String.fromCodePoint(codePoint))
    .filter((character) => /\p{M}/u.test(character));
  const LONG_RUN = 30;

  it('refuses a run of exactly the marks KaTeX cannot set in a run', () => {
    expect(ALL_MARKS.length).toBeGreaterThan(2000);
    const wronglyJudged = ALL_MARKS.filter((mark) => {
      const tex = `x${mark.repeat(LONG_RUN)}`;
      return (getTexProblem(tex) === null) !== canRenderTex(tex);
    });
    expect(wronglyJudged).toEqual([]);
  });

  it.each([24, 50, 100, 120, 135, 200, 300, 400, 495])('refuses at both layers the run of %i marks the tab crash work tried', (count) => {
    const tex = `x${'\u0301'.repeat(count)}`;
    expect(getTexProblem(tex)).toMatch(/at most 2 accent marks/);
    expect(canRenderTex(tex)).toBe(false);
  });

  it('stays bounded when marks that do not nest split a run of marks that do', () => {
    const tex = 'x\u0301\u0301\u093c'.repeat(120);
    expect(getTexProblem(tex)).toBeNull();
    expect(canRenderTex(tex)).toBe(false);
  });

  it.each([
    ['the add word', String.raw`5 + 3 = 8 \quad \text{जोड़ें}`],
    ['the read word', String.raw`\text{पढ़ें} = 5`],
    ['the trees word', String.raw`\text{पेड़ों} = 5`],
    ['a pointed Hebrew word', String.raw`\text{הַשָּׁמַיִם} = 5`],
    ['a Burmese word', String.raw`\text{မြွေ} = 5`],
    ['the longest run of a mark that does not nest', `x${'\u20d7'.repeat(495)}`],
  ])('takes %s at both layers', (_name, tex) => {
    expect(getTexProblem(tex)).toBeNull();
    expect(canRenderTex(tex)).toBe(true);
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
