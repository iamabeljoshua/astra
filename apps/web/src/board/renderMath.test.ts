import { collectMathPaints, getPaintsOfSpans, renderTex } from '@astra/board/drawing';
import { ALLOWED_TEX_COMMANDS, findMathSpans, getMathParts, getTexProblem } from '@astra/contracts';
import { makeTexFuzzSources } from '@astra/board/tex-fuzz';
import { beforeEach, describe, expect, it } from 'vitest';

const raw = String.raw;

beforeEach(() => {
  expect(renderTex('x', document.createElement('div')), 'the KaTeX call the tree limit measures is gone').toBe(true);
});

function render(tex: string): HTMLElement {
  const host = document.createElement('div');
  expect(renderTex(tex, host)).toBe(true);
  return host;
}

describe('the stylesheet the board loads', () => {
  it('sets every KaTeX font to swap, because the blocking build leaves a stalled font blank for 3 s', () => {
    const faces = [...document.querySelectorAll('style')].flatMap((style) => style.textContent.match(/@font-face\s*\{[^}]*\}/g) ?? []);
    expect(faces.length).toBeGreaterThan(0);
    expect(faces.filter((face) => !/font-display:\s*swap/.test(face))).toEqual([]);
  });
});

describe('renderTex', () => {
  it('sets math as KaTeX spans', () => {
    expect(render(raw`\frac{1}{2}`).querySelector('.mfrac')).not.toBeNull();
  });

  it.each([
    raw`\frac{1}`,
    raw`x^2^3`,
    raw`\sqrt`,
    raw`\notARealCommand`,
    raw`\left( x`,
    raw`\begin{matrix} x`,
  ])('refuses %s with no error text left behind', (tex) => {
    const host = document.createElement('div');
    expect(renderTex(tex, host)).toBe(false);
    expect(host.childNodes).toHaveLength(0);
  });

  it.each([
    [raw`\def\a{\a\a}\a`, 'a macro bomb'],
    [raw`\def\a{\a\a\a\a\a\a\a\a\a\a}\a`, 'a macro bomb'],
    [raw`\href{javascript:alert(1)}{x}`, 'a script link'],
    [raw`\href{https://example.com}{x}`, 'a link'],
    [raw`\htmlClass{hostile}{x}`, 'a class of its choosing'],
    [raw`\htmlData{onclick=alert(1)}{x}`, 'raw attributes'],
    [raw`\includegraphics{https://example.com/a.png}`, 'an image'],
  ])('stops %s even if a future parser let it through (%s)', (tex) => {
    const host = document.createElement('div');
    renderTex(tex, host);
    expect(host.querySelector('a, img, .hostile, [onclick], [data-onclick]')).toBeNull();
  });

  it('caps a huge size even if a future parser let it through', () => {
    const host = render(raw`\rule{100000em}{100000em}`);
    const rule = host.querySelector<HTMLElement>('.katex-rule');
    expect(rule?.style.borderRightWidth).toBe('4em');
  });

  it('sets text inside math as text, with nothing to run', () => {
    const host = render(raw`\text{<script>alert(1)</script><img src=x onerror=alert(1)>}`);
    expect(host.querySelector('script, img')).toBeNull();
    expect(host.querySelector('.katex-html')?.textContent).toContain('<script>');
  });
});

function measureTree(root: Node): { depth: number; nodes: number } {
  let deepest = 0;
  let nodes = 0;
  const stack: { node: Node; depth: number }[] = [{ node: root, depth: 0 }];
  for (let entry = stack.pop(); entry; entry = stack.pop()) {
    nodes += 1;
    deepest = Math.max(deepest, entry.depth);
    for (const child of entry.node.childNodes) stack.push({ node: child, depth: entry.depth + 1 });
  }
  return { depth: deepest, nodes };
}

describe('how large a tree renderTex may build', () => {
  const MOST_DEPTH = 125;
  const MOST_NODES = 6000;

  it.each([
    ['a run of accent marks', `x${'\u0301'.repeat(200)}`],
    ['the run that first crashed a tab', `x${'\u0301'.repeat(135)}`],
    ['a run that survived at 606 levels', `x${'\u0301'.repeat(120)}`],
    ['another mark', `x${'\u0308'.repeat(200)}`],
    ['marks inside text', raw`\text{x` + '\u0301'.repeat(200) + '}'],
    ['a matrix of nothing but columns', `\\begin{matrix}${'&'.repeat(470)}\\end{matrix}`],
  ])('refuses %s, leaving nothing behind, even past the parser', (_name, tex) => {
    const host = document.createElement('div');
    expect(renderTex(tex, host)).toBe(false);
    expect(host.childNodes).toHaveLength(0);
  });

  it.each([
    ['the longest line of terms', `${'a+'.repeat(249)}a`],
    ['twelve fractions deep', `${raw`\frac{`.repeat(12)}x${'}{2}'.repeat(12)}`],
    ['twelve scripts deep', `${'x^{'.repeat(12)}y${'}'.repeat(12)}`],
    ['a six by six matrix', raw`\begin{pmatrix}` + Array.from({ length: 6 }, () => '1&2&3&4&5&6').join(raw`\\`) + raw`\end{pmatrix}`],
    ['a Hindi word with three marks in a row', raw`5 + 3 = 8 \quad \text{जोड़ें}`],
    ['the longest run of a mark that does not nest', `x${'\u20d7'.repeat(495)}`],
  ])('still sets %s', (_name, tex) => {
    expect(getTexProblem(tex)).toBeNull();
    const host = render(tex);
    expect(measureTree(host).depth).toBeLessThanOrEqual(MOST_DEPTH);
  });

  it('holds every source the fuzz builds to a bounded tree, and the parser takes none it could not set', () => {
    let passedTheParser = 0;
    let set = 0;
    let deepest = 0;
    let largest = 0;
    for (const tex of makeTexFuzzSources(800, 'renderMath')) {
      if (getTexProblem(tex) !== null) continue;
      passedTheParser += 1;
      const host = document.createElement('div');
      if (renderTex(tex, host)) {
        set += 1;
        const size = measureTree(host);
        deepest = Math.max(deepest, size.depth);
        largest = Math.max(largest, size.nodes);
        expect(size.depth, tex).toBeLessThanOrEqual(MOST_DEPTH);
        expect(size.nodes, tex).toBeLessThanOrEqual(MOST_NODES);
      } else {
        expect(host.childNodes).toHaveLength(0);
      }
    }
    expect(passedTheParser).toBeGreaterThan(200);
    expect(set).toBeGreaterThan(150);
    expect(deepest).toBeGreaterThan(60);
    expect(largest).toBeGreaterThan(1000);
  }, 60_000);
});

describe('collectMathPaints', () => {
  it('finds each glyph once, and each shape, and nothing that holds no ink', () => {
    const paints = collectMathPaints(render(raw`\frac{a}{b} + \sqrt{c}`));
    expect(paints.map((paint) => paint.glyph).filter(Boolean).sort()).toEqual(['+', 'a', 'b', 'c']);
    expect(paints.filter((paint) => paint.glyph === null).map((paint) => paint.element.className)).toEqual(expect.arrayContaining(['frac-line', 'hide-tail']));
  });
});

describe('pieces of ink', () => {
  function getInkInsideInk(tex: string): string[] {
    const host = document.createElement('div');
    if (!renderTex(tex, host)) return [];
    const paints = collectMathPaints(host);
    const ink = new Set(paints.map((paint) => paint.element));
    const isInsideInk = (element: HTMLElement) => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) if (ink.has(parent)) return true;
      return false;
    };
    return paints.filter((paint) => isInsideInk(paint.element)).map((paint) => paint.glyph ?? 'a shape');
  }

  it.each([...ALLOWED_TEX_COMMANDS])('never sit inside each other for %s, so a move carries a letter once', (command) => {
    expect([...getInkInsideInk(`${command} x`), ...getInkInsideInk(`${command}{a}{b}`)]).toEqual([]);
  });
});

describe('which ink belongs to which term', () => {
  it('maps every paint to the term that made it', () => {
    const tex = raw`2x + \frac{8}{2} = 11`;
    const paints = collectMathPaints(render(tex));
    const parts = getMathParts(tex);
    const owners = getPaintsOfSpans(tex, parts, paints) ?? [];
    const texOf = paints.map((paint, index) => [paint.glyph, parts[owners[index] as number]?.tex]);
    expect(texOf).toEqual(expect.arrayContaining([['2', '2x'], ['x', '2x'], ['+', '+'], ['8', raw`\frac{8}{2}`], ['2', raw`\frac{8}{2}`], [null, raw`\frac{8}{2}`], ['=', '='], ['11', '11']]));
  });

  it('finds a term nested inside a fraction', () => {
    const tex = raw`\frac{x+1}{2}`;
    const paints = collectMathPaints(render(tex));
    const owners = getPaintsOfSpans(tex, [{ start: 6, end: 9 }], paints) ?? [];
    expect(paints.filter((_, index) => owners[index] === 0).map((paint) => paint.glyph).sort()).toEqual(['+', '1', 'x']);
  });

  it.each([
    ['x^2 + 1', '2', ['2']],
    ['3x^2', '2', ['2']],
    ['2^x', 'x', ['x']],
    ['2^x', '2', ['2']],
    ['e^x', 'x', ['x']],
    ['a_1 + a_2', '2', ['2']],
    ['a_1 + a_2', 'a_2', ['2', 'a']],
    [raw`\sum_i x_i`, 'i', ['i']],
    [raw`\sum_i x_i`, raw`\sum`, ['∑']],
    [raw`\sum\limits_i x_i`, raw`\sum`, ['∑']],
    [raw`\lim_{x \to 0} x`, raw`\lim`, ['lim']],
    [raw`\int_0^1 x`, raw`\int`, ['∫']],
    [raw`\sin x + 1`, raw`\sin`, ['sin']],
    [raw`\sin x + 1`, raw`\sin x`, ['sin', 'x']],
    [raw`\sqrt2`, '2', ['2']],
    [raw`\hat x`, 'x', ['x']],
    [raw`\vec v`, 'v', ['v']],
    [raw`\frac\pi2`, raw`\pi`, ['π']],
    [raw`\frac\pi2`, '2', ['2']],
    ['b^2 - 4ac', '4ac', ['4', 'a', 'c']],
    ['b^2 - 4ac', 'b^2', ['2', 'b']],
    [raw`\begin{pmatrix} 2 & 1 \\ 1 & 3 \end{pmatrix}`, '3', ['3']],
    [raw`\gcd(a,b)`, raw`\gcd`, ['gcd']],
    [raw`\gcd x`, raw`\gcd`, ['gcd']],
    [raw`\gcd_a x`, raw`\gcd`, ['gcd']],
    [raw`\gcd\limits_a x`, raw`\gcd`, ['gcd']],
    [raw`\gcd\nolimits_a x`, raw`\gcd`, ['gcd']],
    [raw`\limsup\nolimits_n x`, raw`\limsup`, ['lim', 'sup']],
    [raw`\liminf\nolimits_n x`, raw`\liminf`, ['inf', 'lim']],
    [raw`\begin{pmatrix} 2 & 1 \\ 1 & 3 \end{pmatrix} = A`, raw`\begin{pmatrix} 2 & 1 \\ 1 & 3 \end{pmatrix}`, ['(', ')', '1', '1', '2', '3']],
    [raw`A = \begin{cases} x & y \end{cases}`, raw`\begin{cases} x & y \end{cases}`, ['x', 'y', '{']],
  ])('finds in %s the ink of %s', (tex, query, glyphs) => {
    const paints = collectMathPaints(render(tex));
    const [span] = findMathSpans(tex, query);
    const owners = getPaintsOfSpans(tex, [span as { start: number; end: number }], paints) ?? [];
    expect(paints.filter((_, index) => owners[index] === 0).map((paint) => paint.glyph).sort()).toEqual([...glyphs].sort());
  });

  it('says it cannot tell when the part is inside a single piece of ink', () => {
    const tex = raw`\text{area}`;
    const paints = collectMathPaints(render(tex));
    const spans = findMathSpans(tex, 'a');
    expect(getPaintsOfSpans(tex, [spans[0] as { start: number; end: number }], paints)).toBeNull();
  });

  it('says it cannot tell, rather than guess, when the marked copy will not set', () => {
    const tex = raw`\frac{1}{2}`;
    expect(getPaintsOfSpans(tex, [{ start: 0, end: 5 }], collectMathPaints(render(tex)))).toBeNull();
  });
});
