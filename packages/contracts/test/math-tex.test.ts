import { describe, expect, it } from 'vitest';
import { findMathSpans, getMathParts, getTexProblem, parseSceneCommand } from '../src/index.ts';

const raw = String.raw;

function getPartTexts(tex: string): string[] {
  return getMathParts(tex).map((part) => part.tex);
}

describe('getTexProblem', () => {
  it.each([
    raw`2x + 3 = 11`,
    raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
    raw`\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}`,
    raw`\sum_{k=1}^{n} k^2 = \frac{n(n+1)(2n+1)}{6}`,
    raw`\int_0^1 x^2 \, dx = \frac{1}{3}`,
    raw`\left( \frac{a}{b} \right)^2`,
    raw`\sqrt[3]{x}`,
    raw`e^{i\pi} + 1 = 0`,
    raw`\text{area} = \pi r^2`,
    raw`\text{<script>alert(1)</script>}`,
    raw`f(x) = \begin{cases} 1 & x > 0 \\ 0 & x \le 0 \end{cases}`,
    raw`50\% \text{ of } x`,
  ])('accepts %s', (tex) => {
    expect(getTexProblem(tex)).toBeNull();
  });

  it.each([
    ['a macro bomb', raw`\def\a{\a\a}\a`, /known commands only/],
    ['a global macro', raw`\gdef\x{1}`, /known commands only/],
    ['a new command', raw`\newcommand{\x}{1}`, /known commands only/],
    ['an edef bomb', raw`\edef\a{\a\a}`, /known commands only/],
    ['a huge rule', raw`\rule{100000em}{100000em}`, /known commands only/],
    ['a huge kern', raw`x\kern{100000em}y`, /known commands only/],
    ['a huge space', raw`\hspace{100000em}`, /known commands only/],
    ['a raised box', raw`\raisebox{1000em}{x}`, /known commands only/],
    ['a size switch', raw`\Huge x`, /known commands only/],
    ['a color the theme cannot answer for', raw`\textcolor{black}{x}`, /known commands only/],
    ['a color switch', raw`\color{white} x`, /known commands only/],
    ['a color box', raw`\colorbox{red}{x}`, /known commands only/],
    ['a link', raw`\href{javascript:alert(1)}{x}`, /no links, images, or raw HTML/],
    ['an unknown environment', raw`\begin{verbatim}x\end{verbatim}`, /known environments only/],
    ['a comment that hides the rest of the line', 'x % = 2', /no comments or dollar signs/],
    ['a dollar sign', '$x$', /no comments or dollar signs/],
    ['a parameter mark', '#1', /no comments or dollar signs/],
    ['an unclosed group', raw`\frac{1}{2`, /balanced groups/],
    ['a stray closing group', 'x}', /balanced groups/],
    ['a right with no left', raw`x \right)`, /balanced groups/],
    ['an end with no begin', raw`\end{matrix}`, /balanced groups/],
    ['math nested past the limit', `${raw`\sqrt{`.repeat(13)}x${'}'.repeat(13)}`, /nested at most 12/],
    ['a run of accent marks, which KaTeX nests', `x${'\u0301'.repeat(200)}`, /at most 2 accent marks/],
    ['a short run of another mark', `x${'\u0308'.repeat(3)}`, /at most 2 accent marks/],
    ['a run of marks inside text', raw`\text{x` + '\u0301'.repeat(3) + '}', /at most 2 accent marks/],
    ['a run of marks from outside the usual block', `x${'\u20d7'.repeat(3)}`, /at most 2 accent marks/],
  ])('refuses %s', (_name, tex, problem) => {
    expect(getTexProblem(tex)).toMatch(problem);
  });

  it('lets through the accents a real word needs', () => {
    expect(getTexProblem(raw`\text{cafe\u0301}`.replace(String.raw`\u0301`, '\u0301'))).toBeNull();
    expect(getTexProblem(`\\text{e\u0323\u0302}`)).toBeNull();
  });

  it('reaches every command that carries math', () => {
    const problem = parseSceneCommand({ kind: 'writeMath', id: 'eq', tex: raw`\def\a{1}` });
    expect(problem).toEqual({ ok: false, problem: raw`command.tex: expected math with known commands only, not \def` });
  });
});

describe('getMathParts', () => {
  it('splits an equation into its terms, operators, and relations', () => {
    expect(getMathParts('2x + 3 = 11').map(({ tex, role }) => [tex, role])).toEqual([
      ['2x', 'term'],
      ['+', 'operator'],
      ['3', 'term'],
      ['=', 'relation'],
      ['11', 'term'],
    ]);
  });

  it('keeps where each part sits in the source, so the source can be cut at it', () => {
    const tex = raw`x^2  +  \frac{1}{2}`;
    for (const part of getMathParts(tex)) expect(tex.slice(part.start, part.end)).toBe(part.tex);
  });

  it.each([
    ['a fraction', raw`\frac{x+1}{2} = 3`, [raw`\frac{x+1}{2}`, '=', '3']],
    ['a root', raw`\sqrt{x-1} + 2`, [raw`\sqrt{x-1}`, '+', '2']],
    ['an exponent', 'e^{x+1} - 1', ['e^{x+1}', '-', '1']],
    ['a bare exponent sign', 'x^-1 + 2', ['x^-1', '+', '2']],
    ['brackets', '2(x+1) = 4', ['2(x+1)', '=', '4']],
    ['delimiters', raw`\left( x + 1 \right)^2 = 4`, [raw`\left( x + 1 \right)^2`, '=', '4']],
    ['absolute value', '|x + 1| = 3', ['|x + 1|', '=', '3']],
    ['a matrix', raw`\begin{pmatrix} a & -b \\ c & d \end{pmatrix} = 0`, [raw`\begin{pmatrix} a & -b \\ c & d \end{pmatrix}`, '=', '0']],
    ['a half open interval', raw`[0, 1) + 2`, ['[0, 1)', '+', '2']],
    ['text', raw`\text{a + b} = c`, [raw`\text{a + b}`, '=', 'c']],
    ['a leading sign', '-x = 3', ['-', 'x', '=', '3']],
  ])('keeps %s whole', (_name, tex, parts) => {
    expect(getPartTexts(tex)).toEqual(parts);
  });

  it.each([
    ['a stray open bracket', '(x + 1 = 2'],
    ['a line break at the top level', raw`x = 1 \\ y = 2`],
  ])('falls back to grouping for %s, which is always safe', (_name, tex) => {
    expect(getPartTexts(tex).join('').length).toBeLessThanOrEqual(tex.length);
    expect(getMathParts(tex).at(-1)?.role).toBe('term');
  });
});

describe('findMathSpans', () => {
  it('finds a term anywhere, with the leftmost first', () => {
    const tex = raw`3x + \frac{3}{y} = 3`;
    expect(findMathSpans(tex, '3').map(({ start }) => start)).toEqual([0, 11, 19]);
  });

  it('never matches the letters of an environment name', () => {
    const tex = raw`\begin{matrix} a \end{matrix}`;
    expect(findMathSpans(tex, 'a')).toEqual([{ start: tex.indexOf(' a ') + 1, end: tex.indexOf(' a ') + 2 }]);
  });

  it('never matches inside a longer number', () => {
    expect(findMathSpans('13 + 3', '3')).toEqual([{ start: 5, end: 6 }]);
    expect(findMathSpans('9.8 + 8', '8')).toEqual([{ start: 6, end: 7 }]);
  });

  it('ignores spacing differences between the query and the source', () => {
    expect(findMathSpans('x+1 = 2', 'x + 1')).toEqual([{ start: 0, end: 3 }]);
  });

  it('finds nothing for a part that is not there, or for half a group', () => {
    expect(findMathSpans('x + 1', 'y')).toEqual([]);
    expect(findMathSpans(raw`\frac{1}{2}`, '{1')).toEqual([]);
  });
});
