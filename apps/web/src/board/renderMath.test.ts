import { collectMathPaints, getPaintsOfSpans, renderTex } from '@astra/board/drawing';
import { getMathParts } from '@astra/contracts';
import { describe, expect, it } from 'vitest';

const raw = String.raw;

function render(tex: string): HTMLElement {
  const host = document.createElement('div');
  expect(renderTex(tex, host)).toBe(true);
  return host;
}

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

describe('collectMathPaints', () => {
  it('finds each glyph once, and each shape, and nothing that holds no ink', () => {
    const paints = collectMathPaints(render(raw`\frac{a}{b} + \sqrt{c}`));
    expect(paints.map((paint) => paint.glyph).filter(Boolean).sort()).toEqual(['+', 'a', 'b', 'c']);
    expect(paints.filter((paint) => paint.glyph === null).map((paint) => paint.element.className)).toEqual(expect.arrayContaining(['frac-line', 'hide-tail']));
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

  it('says it cannot tell, rather than guess, when the marked copy will not set', () => {
    const tex = raw`\frac{1}{2}`;
    expect(getPaintsOfSpans(tex, [{ start: 0, end: 5 }], collectMathPaints(render(tex)))).toBeNull();
  });
});
