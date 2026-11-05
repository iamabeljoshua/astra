import { type BoardOperation, getBoardAt } from '@astra/board';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMarksArea } from './boardRowPainting';
import { SharedBoard } from './SharedBoard';

const command = (value: object, atMs: number) => ({ kind: 'command', atMs, command: value, overMs: null }) as unknown as BoardOperation;
const table = (id: string, cell: string, atMs: number) => command({ kind: 'table', id, columns: ['Year'], rows: [[cell]] }, atMs);
const LONG_AFTER = 60_000;

describe('the room a mark has', () => {
  it('stays the whole page of rows however far it has scrolled, so a ring scrolled out of sight keeps its shape', () => {
    const scroller = document.createElement('div');
    scroller.className = 'board-scroll';
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    scroller.append(overlay);
    const boardTop = 60;
    const padding = 40;
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ left: 0, top: boardTop, right: 800, bottom: 700 } as DOMRect);
    const topWhenScrolledBy = (scrolled: number) => {
      scroller.scrollTop = scrolled;
      vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({ left: 44, top: boardTop + padding - scrolled, right: 756, bottom: 2000 } as DOMRect);
      return getMarksArea(overlay, new Map(), []).top;
    };
    expect(topWhenScrolledBy(0)).toBe(-padding);
    expect(topWhenScrolledBy(900)).toBe(-padding);
  });
});

describe('following a new row', () => {
  const withBoardHeights = (client: number, scrollHeight: number) => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(client);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
  };
  const boardWithRows = (count: number) => getBoardAt(Array.from({ length: count }, (_, index) => table(`t${String.fromCharCode(97 + index)}`, 'x', index + 1)), LONG_AFTER);

  afterEach(() => vi.restoreAllMocks());

  it('glides for a row or two, and jumps when the move is longer than a screen', () => {
    withBoardHeights(600, 600);
    const { container, rerender } = render(<SharedBoard board={boardWithRows(1)} atMs={LONG_AFTER} />);
    const scroller = container.querySelector<HTMLElement>('.board-scroll') as HTMLElement;
    withBoardHeights(600, 800);
    rerender(<SharedBoard board={boardWithRows(2)} atMs={LONG_AFTER} />);
    expect(scroller.style.scrollBehavior).toBe('');
    withBoardHeights(600, 3000);
    rerender(<SharedBoard board={boardWithRows(3)} atMs={LONG_AFTER} />);
    expect(scroller.style.scrollBehavior).toBe('auto');
    scroller.scrollTop = 2400;
    withBoardHeights(600, 3200);
    rerender(<SharedBoard board={boardWithRows(4)} atMs={LONG_AFTER} />);
    expect(scroller.style.scrollBehavior).toBe('');
  });
});

describe('the shared board', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draws the table a tutor replaces under the same id, and not the old one', () => {
    const first = table('money', '110', 1);
    const { rerender } = render(<SharedBoard board={getBoardAt([first], LONG_AFTER)} atMs={LONG_AFTER} />);
    expect(screen.getByText('110')).toBeTruthy();
    rerender(<SharedBoard board={getBoardAt([first, table('money', '121', 2)], LONG_AFTER)} atMs={LONG_AFTER} />);
    expect(screen.getByText('121')).toBeTruthy();
    expect(screen.queryByText('110')).toBeNull();
  });

  it('shows a label given to a check, beside the check', () => {
    const operations = [table('money', '110', 1), command({ kind: 'annotate', id: 'tick', target: 'money', mark: 'check', label: 'all right' }, 2)];
    render(<SharedBoard board={getBoardAt(operations, LONG_AFTER)} atMs={LONG_AFTER} />);
    expect(screen.getByTestId('mark-check')).toBeTruthy();
    expect(screen.getByText('all right')).toBeTruthy();
  });

  it('gives a table, a timeline, code, and a drawing the row type words use, and leaves math its own', () => {
    const operations = [table('money', '110', 1), command({ kind: 'timeline', id: 'rome', events: [{ when: '27 BC', label: 'Augustus' }] }, 2), command({ kind: 'code', id: 'loop', language: 'python', source: 'print(1)' }, 3), command({ kind: 'drawing', id: 'cell', name: 'animal-cell' }, 4), command({ kind: 'writeMath', id: 'steps', tex: 'x = 1' }, 5)];
    const { container } = render(<SharedBoard board={getBoardAt(operations, LONG_AFTER)} atMs={LONG_AFTER} />);
    const isBlock = (id: string) => container.querySelector(`[data-row="${id}"]`)?.classList.contains('board-row-block');
    expect(['money', 'rome', 'loop', 'cell'].map(isBlock)).toEqual([true, true, true, true]);
    expect(isBlock('steps')).toBe(false);
  });

  it('gives a drawing only ever seen under a flight no row of its own', () => {
    const { container } = render(<SharedBoard board={getBoardAt([command({ kind: 'drawing', id: 'court', name: 'hoop-side' }, 1)], LONG_AFTER)} atMs={LONG_AFTER} />);
    expect(container.querySelector('[data-row="court"]')).toBeNull();
  });

  it('draws a comparison table with an empty corner', () => {
    const operations = [command({ kind: 'table', id: 'cells', columns: ['', 'Mitosis', 'Meiosis'], rows: [['Divisions', '1', '2']] }, 1)];
    const { container } = render(<SharedBoard board={getBoardAt(operations, LONG_AFTER)} atMs={LONG_AFTER} />);
    expect([...container.querySelectorAll('th')].map((cell) => cell.textContent)).toEqual(['', 'Mitosis', 'Meiosis']);
  });

  it('paints no broken numbers on a row with no width yet', () => {
    const operations = [command({ kind: 'plot', id: 'wave', expression: 'sin(x)', domain: [-6, 6], label: 'one wave' }, 1), command({ kind: 'markValue', id: 'top', target: 'wave', at: 1.57, label: 'top' }, 2)];
    const { container } = render(<SharedBoard board={getBoardAt(operations, LONG_AFTER)} atMs={LONG_AFTER} />);
    expect(container.querySelector('[data-element="wave"]')).toBeTruthy();
    expect(container.innerHTML).not.toContain('NaN');
  });

  it.each([
    ['a figure built a step at a time', [{ kind: 'geometry', id: 'tri', xRange: [0, 6], yRange: [0, 5] }, { kind: 'construct', id: 'pa', target: 'tri', step: { shape: 'point', name: 'A', x: 1, y: 1 } }, { kind: 'construct', id: 'pb', target: 'tri', step: { shape: 'point', name: 'B', x: 5, y: 1 } }, { kind: 'construct', id: 'pc', target: 'tri', step: { shape: 'point', name: 'C', x: 1, y: 4 } }, { kind: 'construct', id: 'ab', target: 'tri', step: { shape: 'segment', from: 'A', to: 'B' } }, { kind: 'construct', id: 'round', target: 'tri', step: { shape: 'circle', center: 'A', through: 'B' } }, { kind: 'construct', id: 'at-a', target: 'tri', step: { shape: 'angle', at: 'A', from: 'B', to: 'C' } }], ['point-pa', 'segment-ab', 'circle-round', 'angle-at-a']],
    ['a number line with a dot', [{ kind: 'numberLine', id: 'line', domain: [-5, 5] }, { kind: 'markValue', id: 'here', target: 'line', at: -2, label: 'minus two' }], ['line', 'mark-here']],
    ['a shaded area under a curve', [{ kind: 'plot', id: 'curve', expression: 'x^2', domain: [0, 3] }, { kind: 'shadeArea', id: 'under', target: 'curve', from: 0, to: 2, label: 'distance' }], ['curve-curve', 'shade-under-curve']],
    ['a flight with a tracked arrow, a readout, and a ghost path', [{ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 5, releaseHeight: 1, gravity: 9.8 } } }, { kind: 'runSimulation', target: 'shot', action: 'seek', to: 'peak' }, { kind: 'trackVector', id: 'speed', target: 'shot', quantity: 'velocity', label: 'speed' }, { kind: 'readout', id: 'high', target: 'shot', quantity: 'height' }, { kind: 'ghostPath', id: 'first', target: 'shot' }], ['ball', 'tracked-speed', 'ghost-first']],
  ])('draws %s on the live board', (_, commands, marks) => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
    const { container } = render(<SharedBoard board={getBoardAt(commands.map((each, index) => command(each, index + 1)), LONG_AFTER)} atMs={LONG_AFTER} />);
    const drawn = new Set([...container.querySelectorAll('[data-mark]')].map((mark) => mark.getAttribute('data-mark')));
    expect(marks.filter((mark) => !drawn.has(mark))).toEqual([]);
    expect(container.innerHTML).not.toContain('NaN');
  });

  it('builds a diagram a node at a time as reveal goes', () => {
    const diagram = command({ kind: 'diagram', id: 'cycle', startsEmpty: true, nodes: [{ name: 'sea', label: 'Sea' }, { name: 'cloud', label: 'Cloud' }, { name: 'rain', label: 'Rain' }], edges: [{ from: 'sea', to: 'cloud' }, { from: 'cloud', to: 'rain' }] }, 1);
    const shownBoxes = (upTo: number) => {
      const { container, unmount } = render(<SharedBoard board={getBoardAt([diagram, command({ kind: 'reveal', target: 'cycle', upTo }, 2)], LONG_AFTER)} atMs={LONG_AFTER} />);
      const count = [...container.querySelectorAll<SVGPathElement>('path[data-ink="box"]')].filter((box) => box.style.visibility !== 'hidden').length;
      unmount();
      return count;
    };
    expect([shownBoxes(0), shownBoxes(2), shownBoxes(3)]).toEqual([0, 2, 3]);
  });

  it('tells the tutor once when a curve turns too fast to draw', () => {
    const onBoardProblem = vi.fn();
    const operations = [command({ kind: 'plot', id: 'fine', expression: 'sin(9000*x)', domain: [0, 100] }, 1)];
    const { rerender } = render(<SharedBoard board={getBoardAt(operations, LONG_AFTER)} atMs={LONG_AFTER} onBoardProblem={onBoardProblem} />);
    rerender(<SharedBoard board={getBoardAt(operations, LONG_AFTER + 1)} atMs={LONG_AFTER + 1} onBoardProblem={onBoardProblem} />);
    expect(onBoardProblem.mock.calls.filter(([{ kind }]) => kind === 'curveTooFine')).toEqual([[{ kind: 'curveTooFine', target: 'fine' }]]);
  });
});
