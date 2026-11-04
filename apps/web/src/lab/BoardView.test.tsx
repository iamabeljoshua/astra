import { getBoardAt, type BoardOperation, rebuildBoard } from '@astra/board';
import { getTexProblem, parseSceneCommand, parseSessionEvent, type SessionEvent } from '@astra/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardView } from './BoardView';

const OPERATIONS: BoardOperation[] = [
  { kind: 'beatStarted', atMs: 0 },
  { kind: 'command', atMs: 100, overMs: null, command: { kind: 'text', id: 'title' as never, text: 'A jump shot' } },
  { kind: 'command', atMs: 500, overMs: null, command: { kind: 'simulate', id: 'shot' as never, simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 5, releaseHeight: 2, gravity: 9.8 } } } },
];

describe('BoardView', () => {
  it('draws only what the board holds at this moment, and says once when each element first appears', () => {
    const onElementDrawn = vi.fn();
    const { rerender } = render(<BoardView board={getBoardAt(OPERATIONS, 50)} atMs={50} onElementDrawn={onElementDrawn} />);
    expect(screen.queryByText('A jump shot')).toBeNull();
    rerender(<BoardView board={getBoardAt(OPERATIONS, 200)} atMs={200} onElementDrawn={onElementDrawn} />);
    expect(screen.getByText('A jump shot')).toBeTruthy();
    rerender(<BoardView board={getBoardAt(OPERATIONS, 300)} atMs={300} onElementDrawn={onElementDrawn} />);
    expect(onElementDrawn.mock.calls).toEqual([['title']]);
  });

  it('fades an element in from the clock, so a frozen board keeps its place', () => {
    const { container } = render(<BoardView board={getBoardAt(OPERATIONS, 200)} atMs={200} />);
    expect(container.querySelector<HTMLElement>('[data-element="title"]')?.style.opacity).toBe('0.25');
  });

  it('draws a ball once a simulation is placed', () => {
    const { container, rerender } = render(<BoardView board={getBoardAt(OPERATIONS, 200)} atMs={200} />);
    expect(container.querySelectorAll('[data-mark="ball"]')).toHaveLength(0);
    rerender(<BoardView board={getBoardAt(OPERATIONS, 600)} atMs={600} />);
    expect(container.querySelectorAll('[data-mark="ball"]')).toHaveLength(1);
  });
});

const raw = String.raw;

function write(id: string, tex: string, atMs = 0): BoardOperation {
  return { kind: 'command', atMs, overMs: null, command: { kind: 'writeMath', id: id as never, tex } };
}

function rearrange(target: string, tex: string, atMs: number): BoardOperation {
  return { kind: 'command', atMs, overMs: null, command: { kind: 'transformMath', target: target as never, tex } };
}

describe('BoardView, math', () => {
  const getMathText = (container: HTMLElement, id: string) => container.querySelector(`[data-element="${id}"] .katex-html`)?.textContent;

  it('sets an equation with KaTeX and never shows its source', () => {
    const { container } = render(<BoardView board={getBoardAt([write('eq', raw`\frac{1}{2} = x`)], 2000)} atMs={2000} />);
    expect(container.querySelector('[data-element="eq"] .mfrac')).not.toBeNull();
    expect(container.querySelector('.katex-html')?.textContent).not.toContain('\\');
  });

  it('marks every term so a later command or a click can name it', () => {
    const { container } = render(<BoardView board={getBoardAt([write('eq', '2x + 3 = 11')], 2000)} atMs={2000} />);
    const terms = [...container.querySelectorAll<HTMLElement>('[data-element="eq"] [data-term]')].map((element) => [element.textContent, element.dataset.term]);
    expect(terms).toEqual([['2', 't1'], ['x', 't1'], ['+', 't2'], ['3', 't3'], ['=', 't4'], ['11', 't5']]);
  });

  it('marks the terms of a line that holds a function name', () => {
    const { container } = render(<BoardView board={getBoardAt([write('eq', raw`\sin x + 1 = 2`)], 2000)} atMs={2000} />);
    const terms = [...container.querySelectorAll<HTMLElement>('[data-element="eq"] [data-term]')].map((element) => [element.textContent, element.dataset.term]);
    expect(terms).toEqual(expect.arrayContaining([['sin', 't1'], ['x', 't1'], ['+', 't2'], ['2', 't5']]));
  });

  it('keeps a term id through a rearrangement', () => {
    const operations = [write('eq', '2x + 3 = 11'), rearrange('eq', '2x = 11 - 3', 2000)];
    const { container } = render(<BoardView board={getBoardAt(operations, 4000)} atMs={4000} />);
    const three = [...container.querySelectorAll<HTMLElement>('[data-term]')].find((element) => element.textContent === '3');
    expect(three?.dataset.term).toBe('t3');
    expect(getMathText(container, 'eq')).toContain('11');
  });

  it('holds both equations while one rearranges into the other, and leaves one when done', () => {
    const operations = [write('eq', '2x + 3 = 11'), rearrange('eq', '2x = 8', 2000)];
    const midway = render(<BoardView board={getBoardAt(operations, 2400)} atMs={2400} />);
    expect(midway.container.querySelectorAll('[data-element="eq"] [data-tex]')).toHaveLength(2);
    midway.rerender(<BoardView board={getBoardAt(operations, 2900)} atMs={2900} />);
    expect([...midway.container.querySelectorAll<HTMLElement>('[data-element="eq"] [data-tex]')].map((host) => host.dataset.tex)).toEqual(['2x = 8']);
  });

  it('writes the same picture for the same moment, so a replay and a live board cannot differ', () => {
    const operations = [write('eq', '2x + 3 = 11'), rearrange('eq', '2x = 11 - 3', 2000)];
    const first = render(<BoardView board={getBoardAt(operations, 2300)} atMs={2300} />);
    const second = render(<BoardView board={getBoardAt(operations, 2300)} atMs={2300} />);
    expect(first.container.innerHTML).toBe(second.container.innerHTML);
  });

  it('leaves the plain KaTeX tree at rest, with no motion left on any piece of ink', () => {
    const { container } = render(<BoardView board={getBoardAt([write('eq', raw`\frac{1}{2}`)], 5000)} atMs={5000} />);
    for (const element of container.querySelectorAll<HTMLElement>('[data-element="eq"] .katex-html *')) {
      expect(element.style.visibility).toBe('');
      expect(element.style.transform).toBe('');
      expect(element.style.clipPath).toBe('');
    }
  });

  it('writes nothing to the page on a frame where nothing changed', async () => {
    const operations = [write('eq', '2x + 3 = 11')];
    const { container, rerender } = render(<BoardView board={getBoardAt(operations, 5000)} atMs={5000} />);
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => changes.push(...records));
    observer.observe(container, { attributes: true, childList: true, subtree: true, characterData: true });
    for (const atMs of [5016, 5033, 5050]) rerender(<BoardView board={getBoardAt(operations, atMs)} atMs={atMs} />);
    await Promise.resolve();
    observer.disconnect();
    expect(changes).toEqual([]);
  });

  it('draws nothing from reduced motion that moves, and lands the rearrangement on its word', () => {
    window.matchMedia = (() => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    try {
      const operations = [write('eq', '2x + 3 = 11'), rearrange('eq', '2x = 11 - 3', 2000)];
      const { container } = render(<BoardView board={getBoardAt(operations, 2400)} atMs={2400} />);
      for (const element of container.querySelectorAll<HTMLElement>('[data-element="eq"] .katex-html *')) {
        expect(element.style.transform).toBe('');
        expect(element.style.clipPath).toBe('');
      }
      const hosts = [...container.querySelectorAll<HTMLElement>('[data-tex]')].map((host) => [host.dataset.tex, host.style.opacity]);
      expect(hosts).toEqual(expect.arrayContaining([['2x + 3 = 11', '0.5'], ['2x = 11 - 3', '0.5']]));
    } finally {
      window.matchMedia = (() => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    }
  });
});

describe('BoardView, marks', () => {
  function mark(command: object, atMs: number): BoardOperation {
    return { kind: 'command', atMs, overMs: null, command: command as never };
  }

  const getStrokes = (container: HTMLElement) => container.querySelectorAll('.board-marks g path');

  it('rings the term a highlight names', () => {
    const operations = [write('eq', '2x + 3 = 11'), mark({ kind: 'highlight', id: 'ring', target: 'eq', tex: '3' }, 500)];
    const { container } = render(<BoardView board={getBoardAt(operations, 3000)} atMs={3000} />);
    expect(getStrokes(container)).toHaveLength(1);
  });

  it('marks a term by its id, as a later command or a click will', () => {
    const operations = [write('eq', '2x + 3 = 11'), mark({ kind: 'annotate', id: 'cross', target: 'eq.t3', mark: 'cross' }, 500)];
    const { container } = render(<BoardView board={getBoardAt(operations, 3000)} atMs={3000} />);
    expect(getStrokes(container)).toHaveLength(2);
  });

  it('removes a mark with hide, and when its equation goes', () => {
    const operations = [write('eq', '2x = 8'), mark({ kind: 'highlight', id: 'ring', target: 'eq', tex: '8' }, 500)];
    const { container, rerender } = render(<BoardView board={getBoardAt(operations, 3000)} atMs={3000} />);
    const hidden = [...operations, mark({ kind: 'hide', target: 'ring' }, 3100)];
    rerender(<BoardView board={getBoardAt(hidden, 3200)} atMs={3200} />);
    expect(getStrokes(container)).toHaveLength(0);
  });

  it('follows a term through a rearrangement, and lets go of one that is gone', () => {
    const operations = [write('eq', '2x + 3 = 11'), mark({ kind: 'highlight', id: 'ring', target: 'eq', tex: '3' }, 500), rearrange('eq', '2x = 11 - 3', 2000)];
    const { container, rerender } = render(<BoardView board={getBoardAt(operations, 4000)} atMs={4000} />);
    expect(getStrokes(container)).toHaveLength(1);
    const gone = [...operations, rearrange('eq', '2x = 8', 5000)];
    rerender(<BoardView board={getBoardAt(gone, 7000)} atMs={7000} />);
    expect(container.querySelector<SVGGElement>('.board-marks g')?.style.visibility).toBe('hidden');
  });

  it.each([
    ['x^2 + 1', '2'],
    ['3x^2', '2'],
    ['2^x', 'x'],
    ['e^x', 'x'],
    ['a_1 + a_2', '2'],
    [raw`\sum_i x_i`, 'i'],
    [raw`\sqrt2`, '2'],
    [raw`\hat x`, 'x'],
    [raw`\vec v`, 'v'],
    [raw`\frac\pi2`, raw`\pi`],
  ])('rings a part of %s written without braces: %s', (tex, part) => {
    const onBoardProblem = vi.fn();
    const operations = [write('eq', tex), mark({ kind: 'highlight', id: 'ring', target: 'eq', tex: part }, 500)];
    const { container } = render(<BoardView board={getBoardAt(operations, 3000)} atMs={3000} onBoardProblem={onBoardProblem} />);
    expect(getStrokes(container)).toHaveLength(1);
    expect(onBoardProblem).not.toHaveBeenCalled();
  });

  it.each([
    [raw`\gcd(a,b) = 1`, raw`\gcd`],
    [raw`\limsup\nolimits_n x`, raw`\limsup`],
    [raw`\liminf\nolimits_n x`, raw`\liminf`],
    [raw`\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix} = A`, raw`\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}`],
  ])('rings in %s the whole of %s', (tex, part) => {
    const onBoardProblem = vi.fn();
    const operations = [write('eq', tex), mark({ kind: 'highlight', id: 'ring', target: 'eq', tex: part }, 500)];
    const { container } = render(<BoardView board={getBoardAt(operations, 3000)} atMs={3000} onBoardProblem={onBoardProblem} />);
    expect(getStrokes(container)).toHaveLength(1);
    expect(onBoardProblem).not.toHaveBeenCalled();
  });

  it.each([
    ['a part that is not there', mark({ kind: 'highlight', id: 'ring', target: 'eq', tex: 'y' }, 500), { kind: 'markWithoutTarget', markId: 'ring', target: 'eq', tex: 'y' }],
    ['an occurrence past the last', mark({ kind: 'highlight', id: 'ring', target: 'eq', tex: '8', occurrence: 3 }, 500), { kind: 'markWithoutTarget', markId: 'ring', target: 'eq', tex: '8' }],
    ['a term id that is not there', mark({ kind: 'annotate', id: 'cross', target: 'eq.t9', mark: 'cross' }, 500), { kind: 'markWithoutTarget', markId: 'cross', target: 'eq.t9' }],
    ['half of a command', mark({ kind: 'highlight', id: 'ring', target: 'eq', tex: raw`\frac` }, 500), { kind: 'markWithoutTarget', markId: 'ring', target: 'eq', tex: raw`\frac` }],
    ['an element not on the board', mark({ kind: 'highlight', id: 'ring', target: 'gone', tex: '8' }, 500), { kind: 'markWithoutTarget', markId: 'ring', target: 'gone', tex: '8' }],
  ])('reports a mark on %s, once, rather than point at nothing', (_name, ring, problem) => {
    const onBoardProblem = vi.fn();
    const operations = [write('eq', raw`\frac{1}{2} = 8`), ring];
    const { container, rerender } = render(<BoardView board={getBoardAt(operations, 3000)} atMs={3000} onBoardProblem={onBoardProblem} />);
    rerender(<BoardView board={getBoardAt(operations, 3100)} atMs={3100} onBoardProblem={onBoardProblem} />);
    expect(onBoardProblem.mock.calls).toEqual([[problem]]);
    expect(getStrokes(container)).toHaveLength(0);
  });

  it.each([
    ['drew', '8'],
    ['reported', 'y'],
  ])('reports a mark id used again on a missing target, after the first use %s', (_name, firstPart) => {
    const onBoardProblem = vi.fn();
    const first = [write('eq', '2x = 8'), mark({ kind: 'highlight', id: 'ring', target: 'eq', tex: firstPart }, 500)];
    const { rerender } = render(<BoardView board={getBoardAt(first, 1000)} atMs={1000} onBoardProblem={onBoardProblem} />);
    onBoardProblem.mockClear();
    const reused = [...first, mark({ kind: 'hide', target: 'ring' }, 2000), mark({ kind: 'highlight', id: 'ring', target: 'eq', tex: 'q' }, 2100)];
    rerender(<BoardView board={getBoardAt(reused, 3000)} atMs={3000} onBoardProblem={onBoardProblem} />);
    rerender(<BoardView board={getBoardAt(reused, 3100)} atMs={3100} onBoardProblem={onBoardProblem} />);
    expect(onBoardProblem.mock.calls).toEqual([[{ kind: 'markWithoutTarget', markId: 'ring', target: 'eq', tex: 'q' }]]);
  });

  it('reports a mark that never drew only once through a freeze', () => {
    const onBoardProblem = vi.fn();
    const operations: BoardOperation[] = [write('eq', '2x = 8'), mark({ kind: 'highlight', id: 'ring', target: 'eq', tex: 'q' }, 500), { kind: 'freeze', atMs: 700, frames: [] }];
    const { rerender } = render(<BoardView board={getBoardAt(operations, 600)} atMs={600} onBoardProblem={onBoardProblem} />);
    rerender(<BoardView board={getBoardAt(operations, 800)} atMs={800} onBoardProblem={onBoardProblem} />);
    expect(onBoardProblem).toHaveBeenCalledTimes(1);
  });

  it('reports nothing when a term it ringed leaves through a rearrangement', () => {
    const onBoardProblem = vi.fn();
    const operations = [write('eq', '2x + 3 = 11'), mark({ kind: 'highlight', id: 'ring', target: 'eq', tex: '3' }, 500), rearrange('eq', '2x = 8', 2000)];
    const { rerender } = render(<BoardView board={getBoardAt(operations, 1000)} atMs={1000} onBoardProblem={onBoardProblem} />);
    rerender(<BoardView board={getBoardAt(operations, 4000)} atMs={4000} onBoardProblem={onBoardProblem} />);
    expect(onBoardProblem).not.toHaveBeenCalled();
  });

  it('reports nothing when the equation it ringed is hidden', () => {
    const onBoardProblem = vi.fn();
    const operations = [write('eq', '2x = 8'), mark({ kind: 'highlight', id: 'ring', target: 'eq', tex: '8' }, 500), mark({ kind: 'hide', target: 'eq' }, 2000)];
    const { rerender } = render(<BoardView board={getBoardAt(operations, 1000)} atMs={1000} onBoardProblem={onBoardProblem} />);
    rerender(<BoardView board={getBoardAt(operations, 4000)} atMs={4000} onBoardProblem={onBoardProblem} />);
    expect(onBoardProblem).not.toHaveBeenCalled();
  });

  it('holds a ring still through a rearrangement that was refused', () => {
    const operations = [write('eq', '2x = 8'), mark({ kind: 'highlight', id: 'ring', target: 'eq', tex: '8' }, 500), rearrange('eq', 'x^2^3', 2000)];
    const { container, rerender } = render(<BoardView board={getBoardAt(operations, 1000)} atMs={1000} />);
    rerender(<BoardView board={getBoardAt(operations, 2300)} atMs={2300} />);
    expect(container.querySelector<SVGGElement>('.board-marks g')?.style.opacity).toBe('');
  });

  it('under reduced motion, fades a ring out where the term was and in where it lands, with no jump', () => {
    window.matchMedia = (() => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    const boxes = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function box(this: Element) {
      const isNewTree = this.closest('[data-tex]')?.getAttribute('data-tex') === '2x = 11 - 3';
      return { left: isNewTree ? 300 : 100, top: 0, right: 0, bottom: 0, width: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) };
    });
    try {
      const operations = [write('eq', '2x + 3 = 11'), mark({ kind: 'highlight', id: 'ring', target: 'eq', tex: '3' }, 500), rearrange('eq', '2x = 11 - 3', 2000)];
      const { container, rerender } = render(<BoardView board={getBoardAt(operations, 1500)} atMs={1500} />);
      const getRing = () => { const group = container.querySelector<SVGGElement>('.board-marks g'); return { opacity: group?.style.opacity, path: group?.querySelector('path')?.getAttribute('d') }; };
      const atRest = getRing();
      rerender(<BoardView board={getBoardAt(operations, 2200)} atMs={2200} />);
      expect(getRing()).toEqual({ opacity: '0.5', path: atRest.path });
      rerender(<BoardView board={getBoardAt(operations, 2600)} atMs={2600} />);
      expect(getRing().opacity).toBe('0.5');
      expect(getRing().path).not.toBe(atRest.path);
    } finally {
      boxes.mockRestore();
      window.matchMedia = (() => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    }
  });

  it('puts the dot beside the element under discussion', () => {
    const operations = [write('eq', '2x = 8'), mark({ kind: 'focus', target: 'eq' }, 500)];
    const { container } = render(<BoardView board={getBoardAt(operations, 3000)} atMs={3000} />);
    expect(container.querySelector<SVGCircleElement>('.board-dot')?.style.visibility).toBe('');
  });
});

describe('BoardView, term ids', () => {
  const getTerms = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-term]')].map((element) => [element.textContent, element.dataset.term]);

  it('marks the ink with the ids the board holds when the same source is written again under the same id', () => {
    const operations = [write('eq', '2x + 3 = 11'), rearrange('eq', '2x = 8', 1000), write('eq', '2x = 8', 3000)];
    const { container, rerender } = render(<BoardView board={getBoardAt(operations, 2900)} atMs={2900} />);
    rerender(<BoardView board={getBoardAt(operations, 6000)} atMs={6000} />);
    const ids = getBoardAt(operations, 6000).elements.get('eq' as never)?.math?.terms.map((term) => [term.tex, term.id]);
    expect(getTerms(container).find(([glyph]) => glyph === '8')?.[1]).toBe(ids?.find(([tex]) => tex === '8')?.[1]);
  });

  it('marks the ink with the ids the board holds after A to B to A inside a move', () => {
    const operations = [write('eq', '2x + 3 = 11'), rearrange('eq', '2x = 8', 2000), rearrange('eq', '2x + 3 = 11', 2200)];
    const { container, rerender } = render(<BoardView board={getBoardAt(operations, 1000)} atMs={1000} />);
    rerender(<BoardView board={getBoardAt(operations, 2100)} atMs={2100} />);
    rerender(<BoardView board={getBoardAt(operations, 5000)} atMs={5000} />);
    const ids = getBoardAt(operations, 5000).elements.get('eq' as never)?.math?.terms.map((term) => [term.tex, term.id]);
    expect(getTerms(container).find(([glyph]) => glyph === '11')?.[1]).toBe(ids?.find(([tex]) => tex === '11')?.[1]);
  });
});

describe('BoardView, a math font that does not arrive', () => {
  const realFonts = document.fonts;
  const useFonts = (fonts: object) => Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
  const getHost = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-element="eq"] [data-tex]');
  const getGlyphStyles = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-element="eq"] .katex-html *')].map((element) => element.style.visibility);
  const operations = [write('eq', 'x = 4')];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    useFonts(realFonts);
  });

  it('holds an equation back only while its font is on the way, and shows it the moment the load fails', async () => {
    const onBoardProblem = vi.fn();
    const failures: ((reason: Error) => void)[] = [];
    useFonts({ status: 'loading', ready: new Promise(() => undefined), check: () => false, load: () => new Promise((_, reject) => failures.push(reject)) });
    const { container, rerender } = render(<BoardView board={getBoardAt(operations, 5000)} atMs={5000} onBoardProblem={onBoardProblem} />);
    expect(getHost(container)?.style.visibility).toBe('hidden');
    for (const fail of failures) fail(new Error('network'));
    await vi.advanceTimersByTimeAsync(0);
    rerender(<BoardView board={getBoardAt(operations, 5016)} atMs={5016} onBoardProblem={onBoardProblem} />);
    expect(getHost(container)?.style.visibility).toBe('');
    expect(onBoardProblem).toHaveBeenCalledWith(expect.objectContaining({ kind: 'fontFallback', reason: 'failed' }));
  });

  it('shows the equation in fallback glyphs at the time limit on a stalled fetch, with no new frame needed, and reports it', async () => {
    const onBoardProblem = vi.fn();
    useFonts({ status: 'loading', ready: new Promise(() => undefined), check: () => false, load: () => new Promise(() => undefined) });
    const { container, rerender } = render(<BoardView board={getBoardAt(operations, 5000)} atMs={5000} onBoardProblem={onBoardProblem} />);
    await vi.advanceTimersByTimeAsync(990);
    expect(getHost(container)?.style.visibility).toBe('hidden');
    await vi.advanceTimersByTimeAsync(20);
    expect(getHost(container)?.style.visibility).toBe('');
    rerender(<BoardView board={getBoardAt(operations, 5016)} atMs={5016} onBoardProblem={onBoardProblem} />);
    expect(onBoardProblem).toHaveBeenCalledWith(expect.objectContaining({ kind: 'fontFallback', reason: 'slow' }));
  });

  it('never makes the next equation wait for a font that already ran out of time', async () => {
    useFonts({ status: 'loading', ready: new Promise(() => undefined), check: () => false, load: () => new Promise(() => undefined) });
    const later = [write('eq', 'x = 4', 0), write('next', 'y = 2', 6000)];
    const { container, rerender } = render(<BoardView board={getBoardAt(later, 5000)} atMs={5000} />);
    await vi.advanceTimersByTimeAsync(1100);
    rerender(<BoardView board={getBoardAt(later, 8000)} atMs={8000} />);
    expect(container.querySelector<HTMLElement>('[data-element="next"] [data-tex]')?.style.visibility).toBe('');
  });

  it('lays the equation out again when the font lands after the fallback', async () => {
    const arrivals: ((faces: unknown[]) => void)[] = [];
    useFonts({ status: 'loading', ready: new Promise(() => undefined), check: () => false, load: () => new Promise((resolve) => arrivals.push(resolve)) });
    const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    const { container, rerender } = render(<BoardView board={getBoardAt(operations, 5000)} atMs={5000} />);
    await vi.advanceTimersByTimeAsync(1100);
    expect(container.querySelector<HTMLElement>('[data-element="eq"]')?.style.width).toBe('100px');
    width.mockReturnValue(140);
    for (const arrive of arrivals) arrive([]);
    await vi.advanceTimersByTimeAsync(0);
    rerender(<BoardView board={getBoardAt(operations, 5016)} atMs={5016} />);
    expect(container.querySelector<HTMLElement>('[data-element="eq"]')?.style.width).toBe('140px');
  });

  it('lays the equation out again when the font lands with no frame before a rebuild', async () => {
    const arrivals: ((faces: unknown[]) => void)[] = [];
    let hasLanded = false;
    useFonts({ status: 'loading', ready: new Promise(() => undefined), check: () => hasLanded, load: () => new Promise((resolve) => arrivals.push(resolve)) });
    const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    const moving = [write('eq', 'x = 4'), rearrange('eq', 'x = 2 + 2', 6000)];
    const { container, rerender } = render(<BoardView board={getBoardAt(moving, 6100)} atMs={6100} />);
    await vi.advanceTimersByTimeAsync(1100);
    expect(container.querySelector<HTMLElement>('[data-element="eq"]')?.style.width).toBe('100px');
    width.mockReturnValue(140);
    hasLanded = true;
    for (const arrive of arrivals) arrive([]);
    await vi.advanceTimersByTimeAsync(0);
    rerender(<BoardView board={getBoardAt(moving, 9000)} atMs={9000} />);
    expect(container.querySelector<HTMLElement>('[data-element="eq"]')?.style.width).toBe('140px');
  });

  it('never touches the clock: the same moment draws the same glyphs on each side of the time limit', async () => {
    useFonts({ status: 'loading', ready: new Promise(() => undefined), check: () => false, load: () => new Promise(() => undefined) });
    const moment = 150;
    const { container, rerender } = render(<BoardView board={getBoardAt(operations, moment)} atMs={moment} />);
    const before = getGlyphStyles(container);
    expect(before).toContain('hidden');
    await vi.advanceTimersByTimeAsync(1100);
    rerender(<BoardView board={getBoardAt(operations, moment)} atMs={moment} />);
    expect(getHost(container)?.style.visibility).toBe('');
    expect(getGlyphStyles(container)).toEqual(before);
  });
});

describe('BoardView, what a screen reader gets', () => {
  it('hides the overlay of marks, which names nothing', () => {
    const operations = [write('eq', '2x = 8'), { kind: 'command', atMs: 0, overMs: null, command: { kind: 'highlight', id: 'ring', target: 'eq', tex: '8' } } as BoardOperation];
    const { container } = render(<BoardView board={getBoardAt(operations, 3000)} atMs={3000} />);
    expect(container.querySelector('.board-marks')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('names handwriting, because its strokes hold no text', () => {
    const text: BoardOperation = { kind: 'command', atMs: 0, overMs: null, command: { kind: 'text', id: 'note' as never, text: 'Find x', handwritten: true } };
    render(<BoardView board={getBoardAt([text], 3000)} atMs={3000} />);
    expect(screen.getByRole('img', { name: 'Find x' })).toBeTruthy();
  });

  it('names a hand drawn diagram by its nodes', () => {
    const diagram: BoardOperation = { kind: 'command', atMs: 0, overMs: null, command: { kind: 'diagram', id: 'flow' as never, nodes: [{ name: 'a', label: 'Rain' }, { name: 'b', label: 'River' }], edges: [{ from: 'a', to: 'b' }], handwritten: true } };
    render(<BoardView board={getBoardAt([diagram], 3000)} atMs={3000} />);
    expect(screen.getByRole('img', { name: 'Rain, River' })).toBeTruthy();
  });
});

describe('BoardView, hostile content from a model', () => {
  const HOSTILE_TEXT = '<img src=x onerror="window.pwned=1"><script>window.pwned=1</script>';

  it('shows plain text as text and never as HTML', () => {
    const text: BoardOperation = { kind: 'command', atMs: 0, overMs: null, command: { kind: 'text', id: 'note' as never, text: HOSTILE_TEXT } };
    const { container } = render(<BoardView board={getBoardAt([text], 2000)} atMs={2000} />);
    expect(container.querySelector('img, script')).toBeNull();
    expect(container.textContent).toContain('<img src=x');
  });

  it('draws handwritten text as strokes, with no text in the page to run', () => {
    const text: BoardOperation = { kind: 'command', atMs: 0, overMs: null, command: { kind: 'text', id: 'note' as never, text: HOSTILE_TEXT, handwritten: true } };
    const { container } = render(<BoardView board={getBoardAt([text], 9000)} atMs={9000} />);
    expect(container.querySelector('img, script')).toBeNull();
    expect(container.querySelector('[data-element="note"]')?.textContent).toBe('');
    expect(container.querySelectorAll('[data-element="note"] path').length).toBeGreaterThan(0);
  });

  it('falls back to plain text for a character the strokes lack', () => {
    const text: BoardOperation = { kind: 'command', atMs: 0, overMs: null, command: { kind: 'text', id: 'note' as never, text: 'Ṣade', handwritten: true } };
    const { container } = render(<BoardView board={getBoardAt([text], 2000)} atMs={2000} />);
    expect(screen.getByText('Ṣade')).toBeTruthy();
    expect(container.querySelector('svg[class*="ink"] path')).toBeNull();
  });

  it('sets a diagram label the strokes cannot write as plain text in its box', () => {
    const diagram: BoardOperation = { kind: 'command', atMs: 0, overMs: null, command: { kind: 'diagram', id: 'flow' as never, nodes: [{ name: 'a', label: 'H\u2082O' }, { name: 'b', label: 'Water' }, { name: 'c', label: '<img src=x onerror="window.pwned=1">\u0394' }], edges: [{ from: 'a', to: 'b', label: '\u2192 heat' }, { from: 'b', to: 'c' }] } };
    const { container } = render(<BoardView board={getBoardAt([diagram], 9000)} atMs={9000} />);
    const labels = [...container.querySelectorAll('[data-element="flow"] text')].map((text) => text.textContent);
    expect(labels).toEqual(expect.arrayContaining(['H\u2082O', '\u2192 heat']));
    expect(labels.join(' ')).toContain('<img');
    expect(container.querySelector('img, script')).toBeNull();
    expect(container.querySelector('[data-element="flow"] svg')?.getAttribute('aria-label')).toContain('H\u2082O');
  });

  it('shows a plain diagram label only once its step is reached, on the clock', () => {
    const diagram: BoardOperation = { kind: 'command', atMs: 0, overMs: null, command: { kind: 'diagram', id: 'flow' as never, nodes: [{ name: 'a', label: 'Water' }, { name: 'b', label: 'H\u2082O' }], edges: [] } };
    const { container, rerender } = render(<BoardView board={getBoardAt([diagram], 1)} atMs={1} />);
    const getLabel = () => container.querySelector<SVGTextElement>('[data-element="flow"] text');
    expect(getLabel()?.style.visibility).toBe('hidden');
    rerender(<BoardView board={getBoardAt([diagram], 9000)} atMs={9000} />);
    expect(getLabel()?.style.visibility).toBe('');
    expect(getLabel()?.style.opacity).toBe('');
  });

  it('refuses a tree too deep to lay out, wherever it came from, and keeps the last good equation', () => {
    const onMathRefused = vi.fn();
    const hostile = `x${'\u0301'.repeat(200)}`;
    const operations = [write('eq', '2x = 8'), rearrange('eq', hostile, 2000)];
    const { container, rerender } = render(<BoardView board={getBoardAt(operations, 1000)} atMs={1000} onMathRefused={onMathRefused} />);
    rerender(<BoardView board={getBoardAt(operations, 2400)} atMs={2400} onMathRefused={onMathRefused} />);
    expect(onMathRefused).toHaveBeenCalledWith(hostile);
    expect(container.querySelector('[data-element="eq"] .katex-html')?.textContent).toContain('8');
  });

  it('holds the same limit on a board rebuilt from a log, for math the parser never saw', () => {
    const onMathRefused = vi.fn();
    const hostile = `x${'\u0301'.repeat(200)}`;
    expect(getTexProblem(hostile)).not.toBeNull();
    const log = [{ seq: 0, atMs: 0, kind: 'beatPlayed', turnId: 't', beat: { id: 'b', script: ['Look ', { kind: 'writeMath', id: 'eq', tex: hostile }, 'here. '], expectsReply: false }, wordStartsMs: [0, 300], durationMs: 600, playedWords: 2, firedCueMs: [0], ending: 'finished', frozen: [] }] as unknown as SessionEvent[];
    const { container } = render(<BoardView board={rebuildBoard(log, 3000)} atMs={3000} onMathRefused={onMathRefused} />);
    expect(onMathRefused).toHaveBeenCalledWith(hostile);
    expect(container.querySelector('[data-element="eq"] .katex-html')).toBeNull();
  });

  it('refuses math KaTeX cannot set, reports it, and draws nothing in its place', () => {
    const onMathRefused = vi.fn();
    const { container } = render(<BoardView board={getBoardAt([write('eq', 'x^2^3')], 2000)} atMs={2000} onMathRefused={onMathRefused} />);
    expect(onMathRefused).toHaveBeenCalledWith('x^2^3');
    expect(container.querySelector('[data-element="eq"]')?.textContent).toBe('');
    expect(container.querySelector('.katex-error')).toBeNull();
  });

  it('reports a refusal to the listener of the latest render', () => {
    const onMathRefused = vi.fn();
    const { rerender } = render(<BoardView board={getBoardAt([], 0)} atMs={0} />);
    rerender(<BoardView board={getBoardAt([write('eq', 'x^2^3')], 2000)} atMs={2000} onMathRefused={onMathRefused} />);
    expect(onMathRefused).toHaveBeenCalledWith('x^2^3');
  });

  it('keeps the last good equation when a rearrangement cannot be set', () => {
    const onMathRefused = vi.fn();
    const operations = [write('eq', '2x = 8'), rearrange('eq', 'x^2^3', 2000)];
    const early = render(<BoardView board={getBoardAt(operations, 1000)} atMs={1000} onMathRefused={onMathRefused} />);
    early.rerender(<BoardView board={getBoardAt(operations, 2400)} atMs={2400} onMathRefused={onMathRefused} />);
    expect(onMathRefused).toHaveBeenCalledWith('x^2^3');
    expect(early.container.querySelector('[data-element="eq"] .katex-html')?.textContent).toContain('8');
  });

  it('draws no mark for a term that is not in the equation', () => {
    const operations = [write('eq', '2x = 8'), { kind: 'command', atMs: 500, overMs: null, command: { kind: 'highlight', id: 'ring', target: 'eq', tex: 'y' } } as BoardOperation];
    const { container } = render(<BoardView board={getBoardAt(operations, 3000)} atMs={3000} />);
    expect(container.querySelectorAll('svg g path')).toHaveLength(0);
  });

  it('survives a mark and a focus on something not on the board', () => {
    const operations: BoardOperation[] = [
      { kind: 'command', atMs: 0, overMs: null, command: { kind: 'highlight', id: 'ring', target: 'gone' as never } as never },
      { kind: 'command', atMs: 0, overMs: null, command: { kind: 'focus', target: 'gone' as never } },
    ];
    expect(() => render(<BoardView board={getBoardAt(operations, 3000)} atMs={3000} />)).not.toThrow();
  });
});

describe('BoardView, figures', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(700);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const place = (command: object, atMs = 0): BoardOperation => ({ kind: 'command', atMs, overMs: null, command: command as never });
  const plot = place({ kind: 'plot', id: 'curve', expression: 'a*x', constants: [{ name: 'a', value: 1, min: 0, max: 4 }], domain: [0, 2], label: '<b>not markup</b>' });
  const slider = place({ kind: 'slider', id: 'a-slider', target: 'curve', constant: 'a', min: 0, max: 4 });

  it('draws a curve as a path, and its label as text and never as markup', () => {
    const { container } = render(<BoardView board={getBoardAt([plot], 5000)} atMs={5000} />);
    expect(container.querySelector('[data-mark="curve-curve"]')?.getAttribute('d')).toMatch(/^M/);
    expect(container.querySelector('[data-mark="label-curve"]')?.textContent).toBe('<b>not markup</b>');
    expect(container.querySelector('svg.board-figure b')).toBeNull();
  });

  it('writes nothing when nothing changed', async () => {
    const { container, rerender } = render(<BoardView board={getBoardAt([plot], 5000)} atMs={5000} />);
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((changes) => records.push(...changes));
    observer.observe(container, { subtree: true, attributes: true, childList: true, characterData: true });
    rerender(<BoardView board={getBoardAt([plot], 6000)} atMs={6000} />);
    await Promise.resolve();
    observer.disconnect();
    expect(records).toEqual([]);
  });

  it('gives a slider the board value and sends a student move', () => {
    const onSliderMove = vi.fn();
    const onSliderRelease = vi.fn();
    const { container } = render(<BoardView board={getBoardAt([plot, slider], 5000)} atMs={5000} canMoveSliders onSliderMove={onSliderMove} onSliderRelease={onSliderRelease} />);
    const input = container.querySelector<HTMLInputElement>('.board-slider input') as HTMLInputElement;
    expect(Number(input.value)).toBe(1);
    expect(container.querySelector('.board-slider-value')?.textContent).toBe('1.00');
    fireEvent.input(input, { target: { value: '2.5' } });
    expect(onSliderMove).toHaveBeenCalledWith({ target: 'curve', value: 2.5, constant: 'a' });
    fireEvent.change(input);
    expect(onSliderRelease).toHaveBeenCalled();
  });

  it('follows the board and cannot be dragged in a replay', () => {
    const moved: BoardOperation = { kind: 'parameterSample', atMs: 100, target: 'curve' as never, parameter: 'a', value: 3 };
    const { container } = render(<BoardView board={getBoardAt([plot, slider, moved], 5000)} atMs={5000} />);
    const input = container.querySelector<HTMLInputElement>('.board-slider input') as HTMLInputElement;
    expect(Number(input.value)).toBe(3);
    expect(input.disabled).toBe(true);
  });

  it('paints a slider on any range and any value without throwing, because a throw during paint takes the whole page', () => {
    for (const [min, max] of [[0, 1e-110], [0, 1e-300], [-1e-99, 1e-99], [-1e6, 1e6], [999999.9999, 1e6], [1e-7, 2e-7]] as const) {
      const operations = [place({ kind: 'plot', id: 'p', expression: 'a*x', constants: [{ name: 'a', value: min, min, max }], domain: [0, 1] }), place({ kind: 'slider', id: 's', target: 'p', constant: 'a', min, max })];
      const { container, unmount } = render(<BoardView board={getBoardAt(operations, 5000)} atMs={5000} canMoveSliders />);
      expect(container.querySelector('.board-slider input')).not.toBeNull();
      unmount();
    }
  });

  describe('extreme numbers the parser takes', () => {
    const EXTREMES = [0, 1, -1, 1e-6, -1e-6, 1 / 3, 0.1, 100, -100, 150, 1e6, -1e6, 999999.999999, 1e-300];
    const PARAMETERS = ['horizontalSpeed', 'upwardSpeed', 'releaseHeight', 'gravity', 'launchAngle', 'launchSpeed'];
    const pickFrom = <Item,>(items: readonly Item[], random: () => number) => items[Math.floor(random() * items.length)] as Item;

    function getRandomScript(random: () => number): unknown[] {
      const pick = () => pickFrom(EXTREMES, random);
      return [
        { kind: 'plot', id: 'curve', expression: pickFrom(['a*x', 'sin(a*x)', '10^308*x', 'a/x', '10^300+a'], random), constants: [{ name: 'a', value: pick(), min: pick(), max: pick() }], domain: [pick(), pick()] },
        { kind: 'slider', id: 'on-curve', target: 'curve', constant: 'a', min: pick(), max: pick() },
        { kind: 'numberLine', id: 'line', domain: [pick(), pick()] },
        { kind: 'markValue', id: 'on-line', target: 'line', at: pick(), label: 'mark' },
        { kind: 'geometry', id: 'shape', xRange: [pick(), pick()], yRange: [pick(), pick()] },
        { kind: 'construct', id: 'point', target: 'shape', step: { shape: 'point', name: 'A', x: pick(), y: pick() } },
        { kind: 'simulate', id: 'flight', simulation: { model: 'projectile', parameters: { horizontalSpeed: pick(), upwardSpeed: pick(), releaseHeight: pick(), gravity: pick() } } },
        { kind: 'slider', id: 'on-flight', target: 'flight', parameter: pickFrom(PARAMETERS, random), min: pick(), max: pick() },
        { kind: 'readout', id: 'far', target: 'flight', quantity: 'landing-distance' },
      ];
    }

    it('paints every figure and slider kind, live and from a stored row, with nothing not finite on the page', () => {
      let seed = 7;
      const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      let painted = 0;
      for (let round = 0; round < 150; round += 1) {
        const commands = getRandomScript(random).filter((command) => parseSceneCommand(command).ok);
        const script = commands.flatMap((command) => [command, 'word ']);
        const parsedRow = parseSessionEvent({ seq: 0, atMs: 0, kind: 'beatPlayed', beat: { id: 'extreme', expectsReply: false, script }, reportedBy: 'browser', turnId: 'turn-1', wordStartsMs: commands.map((_, index) => index * 10), durationMs: commands.length * 10, playedWords: commands.length, firedCueMs: commands.map((_, index) => index * 10), ending: 'finished', frozen: [] });
        if (!parsedRow.ok) continue;
        const operations = commands.flatMap((command, index) => { const parsed = parseSceneCommand(command); return parsed.ok ? [{ kind: 'command', atMs: index * 10, overMs: null, command: parsed.value } as BoardOperation] : []; });
        painted += commands.length;
        for (const board of [getBoardAt(operations, 5000), rebuildBoard([parsedRow.value], 5000)]) {
          const { container, unmount } = render(<BoardView board={board} atMs={5000} canMoveSliders />);
          expect(container.innerHTML).not.toMatch(/NaN|Infinity|undefined/);
          unmount();
        }
      }
      expect(painted).toBeGreaterThan(150);
    });
  });

  describe('what the board tells the tutor about a figure', () => {
    it('says once when a curve is too fine to draw, and notes it in the figure', () => {
      const onBoardProblem = vi.fn();
      const operations = [place({ kind: 'plot', id: 'fine', expression: 'tan(100*x)', domain: [-10, 10] })];
      const { container, rerender } = render(<BoardView board={getBoardAt(operations, 5000)} atMs={5000} onBoardProblem={onBoardProblem} />);
      rerender(<BoardView board={getBoardAt(operations, 5100)} atMs={5100} onBoardProblem={onBoardProblem} />);
      expect(onBoardProblem.mock.calls).toEqual([[{ kind: 'curveTooFine', target: 'fine' }]]);
      expect(container.querySelector('[data-mark="too-fine"]')?.textContent).toBe('Too fine to draw here');
    });

    it('says nothing about a curve it drew', () => {
      const onBoardProblem = vi.fn();
      const { container } = render(<BoardView board={getBoardAt([place({ kind: 'plot', id: 'wave', expression: 'sin(10*x)', domain: [-10, 10] })], 5000)} atMs={5000} onBoardProblem={onBoardProblem} />);
      expect(onBoardProblem).not.toHaveBeenCalled();
      expect(container.querySelector('[data-mark="too-fine"]')).toBeNull();
    });

    it('says once when a slider would say a speed another way than the one on the flight, and draws only the first', () => {
      const onBoardProblem = vi.fn();
      const flight = place({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 10, upwardSpeed: 10, releaseHeight: 0, gravity: 9.8 } } });
      const operations = [flight, place({ kind: 'slider', id: 'angle', target: 'shot', parameter: 'launchAngle', min: 10, max: 80 }), place({ kind: 'slider', id: 'sideways', target: 'shot', parameter: 'horizontalSpeed', min: 0, max: 20 }, 100)];
      const { container, rerender } = render(<BoardView board={getBoardAt(operations, 5000)} atMs={5000} onBoardProblem={onBoardProblem} />);
      rerender(<BoardView board={getBoardAt(operations, 5100)} atMs={5100} onBoardProblem={onBoardProblem} />);
      expect(onBoardProblem.mock.calls).toEqual([[{ kind: 'sliderOverlaps', sliderId: 'sideways', target: 'shot' }]]);
      expect(container.querySelectorAll('.board-slider input')).toHaveLength(1);
    });
  });

  describe('an id placed again', () => {
    const second = place({ kind: 'plot', id: 'curve-two', expression: 'b*x', constants: [{ name: 'b', value: 15, min: 10, max: 20 }], domain: [0, 5], label: 'second' }, 6000);
    const reused = place({ kind: 'slider', id: 'a-slider', target: 'curve-two', constant: 'b', min: 10, max: 20 }, 6000);
    const operations = [plot, slider, place({ kind: 'clearBoard' }, 6000), second, reused];

    it('gives a reused slider its new range, name, value, and target', () => {
      const onSliderMove = vi.fn();
      const { container, rerender } = render(<BoardView board={getBoardAt(operations, 5000)} atMs={5000} canMoveSliders onSliderMove={onSliderMove} />);
      rerender(<BoardView board={getBoardAt(operations, 8000)} atMs={8000} canMoveSliders onSliderMove={onSliderMove} />);
      const input = container.querySelector<HTMLInputElement>('.board-slider input') as HTMLInputElement;
      expect([input.min, input.max, input.value]).toEqual(['10', '20', '15']);
      expect(screen.getByRole('slider', { name: 'b' })).toBe(input);
      expect(input.getAttribute('aria-valuetext')).toBe('15.0');
      fireEvent.input(input, { target: { value: '12' } });
      expect(onSliderMove).toHaveBeenCalledWith({ target: 'curve-two', value: 12, constant: 'b' });
    });

    it('names a reused figure for what it now shows, on a wrapper that stayed', () => {
      const first = place({ kind: 'plot', id: 'curve', expression: 'x', domain: [0, 1], label: 'first' });
      const again = place({ kind: 'plot', id: 'curve', expression: 'x^2', domain: [0, 1], label: 'second' }, 6000);
      const { container, rerender } = render(<BoardView board={getBoardAt([first, again], 5000)} atMs={5000} />);
      rerender(<BoardView board={getBoardAt([first, again], 8000)} atMs={8000} />);
      expect(container.querySelectorAll('svg.board-figure')).toHaveLength(1);
      expect(container.querySelector('svg.board-figure')?.getAttribute('aria-label')).toBe('second');
    });

    it('writes reused handwriting and a reused diagram with the new words', () => {
      const handwriting = [place({ kind: 'text', id: 'note', text: 'first', handwritten: true }), place({ kind: 'text', id: 'note', text: 'second', handwritten: true }, 6000)];
      const diagram = (label: string, atMs: number) => place({ kind: 'diagram', id: 'map', nodes: [{ name: 'a', label }], edges: [] }, atMs);
      const all = [...handwriting, diagram('old', 0), diagram('new', 6000)];
      const { container, rerender } = render(<BoardView board={getBoardAt(all, 5000)} atMs={5000} />);
      rerender(<BoardView board={getBoardAt(all, 8000)} atMs={8000} />);
      expect(container.querySelector('[data-element="note"] svg')?.getAttribute('aria-label')).toBe('second');
      expect(container.querySelector('[data-element="map"] svg')?.getAttribute('aria-label')).toBe('new');
    });

    it('keeps the math item through a rearrangement, so the move can run', () => {
      const moved = [place({ kind: 'writeMath', id: 'eq', tex: '2x = 8' }), place({ kind: 'transformMath', target: 'eq', tex: 'x = 4' }, 6000)];
      const { container, rerender } = render(<BoardView board={getBoardAt(moved, 5000)} atMs={5000} />);
      const before = container.querySelector('[data-element="eq"]')?.firstElementChild;
      rerender(<BoardView board={getBoardAt(moved, 6100)} atMs={6100} />);
      expect(container.querySelector('[data-element="eq"]')?.firstElementChild).toBe(before);
    });

    it('keeps an item when the same command comes from a replay, so a frame held for comparing does not rebuild it', () => {
      const { container, rerender } = render(<BoardView board={getBoardAt([plot, slider], 5000)} atMs={5000} />);
      const before = container.querySelector('.board-slider input');
      rerender(<BoardView board={getBoardAt(JSON.parse(JSON.stringify([plot, slider])) as BoardOperation[], 5000)} atMs={5000} />);
      expect(container.querySelector('.board-slider input')).toBe(before);
    });
  });

  describe('a slider for a screen reader', () => {
    const onShot = [place({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.8 } } }), place({ kind: 'slider', id: 'speed', target: 'shot', parameter: 'horizontalSpeed', min: 0, max: 10 })];

    it('is named for what it changes, and says its value with its unit', () => {
      render(<BoardView board={getBoardAt(onShot, 5000)} atMs={5000} canMoveSliders />);
      const input = screen.getByRole('slider', { name: 'Sideways speed' });
      expect(input.getAttribute('aria-valuetext')).toBe('4.2 m/s');
    });

    it('holds no live region, so a value moving while the tutor talks says nothing over the voice', () => {
      const { container } = render(<BoardView board={getBoardAt(onShot, 5000)} atMs={5000} canMoveSliders />);
      expect(container.querySelector('.board-slider output, .board-slider [aria-live], .board-slider [role="status"]')).toBeNull();
      expect(container.querySelector('.board-slider')?.textContent).toContain('4.2');
    });

    it('draws no slider on a curve without that constant, and tells the tutor', () => {
      const onBoardProblem = vi.fn();
      const operations = [place({ kind: 'plot', id: 'curve', expression: 'x^2', domain: [0, 2] }), place({ kind: 'slider', id: 'a-slider', target: 'curve', constant: 'a', min: 0, max: 4 })];
      const { container } = render(<BoardView board={getBoardAt(operations, 5000)} atMs={5000} canMoveSliders onBoardProblem={onBoardProblem} />);
      expect(container.querySelector('.board-slider')).toBeNull();
      expect(onBoardProblem).toHaveBeenCalledWith({ kind: 'sliderWithoutConstant', sliderId: 'a-slider', target: 'curve', constant: 'a' });
    });

    it('goes when its curve is replaced, and an old mark goes with it', () => {
      const operations = [plot, slider, place({ kind: 'markValue', id: 'lowest', target: 'curve', at: 0, label: 'minimum' }), place({ kind: 'plot', id: 'curve', expression: 'x^2', domain: [0, 2] }, 6000)];
      const { container, rerender } = render(<BoardView board={getBoardAt(operations, 5000)} atMs={5000} canMoveSliders />);
      expect(container.querySelector('.board-slider')).not.toBeNull();
      expect(container.textContent).toContain('minimum');
      rerender(<BoardView board={getBoardAt(operations, 8000)} atMs={8000} canMoveSliders />);
      expect(container.querySelector('.board-slider')).toBeNull();
      expect(container.textContent).not.toContain('minimum');
    });
  });

  it('places a figure for each kind, and a curve drawn over another has no place of its own', () => {
    const over = place({ kind: 'plot', id: 'second', over: 'curve', expression: 'x', domain: [0, 2] });
    const { container } = render(<BoardView board={getBoardAt([plot, over, place({ kind: 'numberLine', id: 'line', domain: [0, 1] }), place({ kind: 'geometry', id: 'shape', xRange: [0, 1], yRange: [0, 1] })], 5000)} atMs={5000} />);
    expect([...container.querySelectorAll<HTMLElement>('[data-element]')].map((element) => element.dataset.element)).toEqual(['curve', 'line', 'shape']);
    const alone = render(<BoardView board={getBoardAt([plot, over], 5000)} atMs={5000} />);
    expect(alone.container.querySelector('[data-mark="curve-second"]')).not.toBeNull();
  });

  it('writes a mark label under what it marks', () => {
    const operations = [place({ kind: 'writeMath', id: 'eq', tex: '2x = 8' }), place({ kind: 'annotate', id: 'note', target: 'eq', mark: 'underline', label: 'both sides' }, 500)];
    const { container } = render(<BoardView board={getBoardAt(operations, 5000)} atMs={5000} />);
    expect(container.querySelector('.board-notes [data-mark="note-note"]')?.textContent).toBe('both sides');
  });

  it('reports a mark on a part a figure does not have, and never one it drew', () => {
    const onBoardProblem = vi.fn();
    const operations = [plot, place({ kind: 'plot', id: 'second', over: 'curve', expression: 'x', domain: [0, 2] }), place({ kind: 'annotate', id: 'on-second', target: 'second.curve', mark: 'circle' }), place({ kind: 'annotate', id: 'on-curve', target: 'curve.curve', mark: 'circle' }), place({ kind: 'annotate', id: 'on-nothing', target: 'curve.nope', mark: 'cross' })];
    const { container } = render(<BoardView board={getBoardAt(operations, 5000)} atMs={5000} onBoardProblem={onBoardProblem} />);
    expect(container.querySelector('[data-mark="note-on-curve"]')).not.toBeNull();
    expect(onBoardProblem.mock.calls.map(([problem]) => problem.markId)).toEqual(['on-nothing']);
  });

  it('does not report a mark it drew when its point is hidden later, and does report one it never drew', () => {
    const onBoardProblem = vi.fn();
    const shape = place({ kind: 'geometry', id: 'shape', xRange: [0, 6], yRange: [0, 6] });
    const point = place({ kind: 'construct', id: 'pa', target: 'shape', step: { shape: 'point', name: 'A', x: 2, y: 2 } });
    const onPoint = place({ kind: 'annotate', id: 'on-a', target: 'shape.A', mark: 'circle' }, 10);
    const operations = [shape, point, onPoint, place({ kind: 'hide', target: 'pa' }, 3000)];
    const { rerender } = render(<BoardView board={getBoardAt(operations, 2000)} atMs={2000} onBoardProblem={onBoardProblem} />);
    rerender(<BoardView board={getBoardAt(operations, 4000)} atMs={4000} onBoardProblem={onBoardProblem} />);
    expect(onBoardProblem).not.toHaveBeenCalled();
    const unseen = render(<BoardView board={getBoardAt([shape, place({ kind: 'markValue', id: 'off', target: 'line', at: 99 }), place({ kind: 'numberLine', id: 'line', domain: [0, 1] }), place({ kind: 'markValue', id: 'off', target: 'line', at: 99 }, 10)], 2000)} atMs={2000} onBoardProblem={onBoardProblem} />);
    expect(unseen.container.querySelector('[data-mark="mark-off"]')).toBeNull();
    expect(onBoardProblem.mock.calls.map(([problem]) => [problem.markId, problem.target])).toEqual([['off', 'line']]);
  });

  it('says so when a label has no room, once', () => {
    const onBoardProblem = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(60);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40);
    const { rerender } = render(<BoardView board={getBoardAt([plot], 5000)} atMs={5000} onBoardProblem={onBoardProblem} />);
    rerender(<BoardView board={getBoardAt([plot], 6000)} atMs={6000} onBoardProblem={onBoardProblem} />);
    expect(onBoardProblem.mock.calls.map(([problem]) => problem)).toEqual([{ kind: 'labelWithoutRoom', text: '<b>not markup</b>' }]);
  });
});
