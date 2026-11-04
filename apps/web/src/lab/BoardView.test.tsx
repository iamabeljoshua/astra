import { getBoardAt, type BoardOperation } from '@astra/board';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

  it('puts the dot beside the element under discussion', () => {
    const operations = [write('eq', '2x = 8'), mark({ kind: 'focus', target: 'eq' }, 500)];
    const { container } = render(<BoardView board={getBoardAt(operations, 3000)} atMs={3000} />);
    expect(container.querySelector<SVGCircleElement>('.board-dot')?.style.visibility).toBe('');
  });
});

describe('BoardView, what a screen reader gets', () => {
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
    const { container } = render(<BoardView board={getBoardAt([plot, slider], 5000)} atMs={5000} onSliderMove={onSliderMove} onSliderRelease={onSliderRelease} />);
    const input = container.querySelector<HTMLInputElement>('.board-slider input') as HTMLInputElement;
    expect(Number(input.value)).toBe(1);
    expect(container.querySelector('.board-slider output')?.textContent).toBe('1.00');
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

  it('places a figure for each kind, and a curve drawn over another has no place of its own', () => {
    const over = place({ kind: 'plot', id: 'second', over: 'curve', expression: 'x', domain: [0, 2] });
    const { container } = render(<BoardView board={getBoardAt([plot, over, place({ kind: 'numberLine', id: 'line', domain: [0, 1] }), place({ kind: 'geometry', id: 'shape', xRange: [0, 1], yRange: [0, 1] })], 5000)} atMs={5000} />);
    expect([...container.querySelectorAll<HTMLElement>('[data-element]')].map((element) => element.dataset.element)).toEqual(['curve', 'line', 'shape']);
    expect(container.querySelector('[data-mark="curve-second"]')).not.toBeNull();
  });

  it('writes a mark label under what it marks', () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(700);
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    const operations = [place({ kind: 'writeMath', id: 'eq', tex: '2x = 8' }), place({ kind: 'annotate', id: 'note', target: 'eq', mark: 'underline', label: 'both sides' }, 500)];
    const { container } = render(<BoardView board={getBoardAt(operations, 5000)} atMs={5000} />);
    expect(container.querySelector('.board-notes [data-mark="note-note"]')?.textContent).toBe('both sides');
    width.mockRestore();
    height.mockRestore();
  });
});
