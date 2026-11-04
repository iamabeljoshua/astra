import { type BoardElement, type BoardOperation, getBoardAt, startMathLine } from '@astra/board';
import { createMathPainter, getFigureMarks } from '@astra/board/drawing';
import type { Root } from 'react-dom/client';
import { BoardView } from '../src/lab/BoardView';
import { BOARD_LABELS } from '../src/strings';

const raw = String.raw;
const FIRST_EQUATION = raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`;
const RENDERS = {
  short: '2x + 3 = 11',
  formula: FIRST_EQUATION,
  matrix: raw`\begin{pmatrix} 2 & 1 \\ 1 & 3 \end{pmatrix} \begin{pmatrix} x \\ y \end{pmatrix} = \begin{pmatrix} 5 \\ 10 \end{pmatrix}`,
  longest: `x = ${Array.from({ length: 50 }, (_, index) => `a_{${index}}`).join(' + ')}`,
};
const RENDER_RUNS = 40;

export function showFirstEquation(root: Root): Promise<void> {
  const operations: BoardOperation[] = [{ kind: 'command', atMs: 0, overMs: null, command: { kind: 'writeMath', id: 'first' as never, tex: FIRST_EQUATION } }];
  root.render(<div style={{ height: 600 }}><BoardView board={getBoardAt(operations, 9000)} atMs={9000} /></div>);
  return new Promise((done) => {
    const check = () => {
      const hasInk = document.querySelector('.katex-html') !== null && document.fonts.status === 'loaded';
      if (hasInk) requestAnimationFrame(() => done());
      else requestAnimationFrame(check);
    };
    check();
  });
}

const FIRST_PLOT: BoardOperation[] = [{ kind: 'command', atMs: 0, overMs: null, command: { kind: 'plot', id: 'first' as never, expression: 'a*x^2 + sin(3*x)', constants: [{ name: 'a', value: 1, min: 0, max: 3 }], domain: [-4, 4], label: 'First curve', xLabel: 'x', yLabel: 'y' } }];

export function showFirstPlot(root: Root): Promise<void> {
  root.render(<div style={{ height: 600 }}><BoardView board={getBoardAt(FIRST_PLOT, 9000)} atMs={9000} /></div>);
  return new Promise((done) => {
    const check = () => {
      if (document.querySelector('[data-mark="curve-first"]')) requestAnimationFrame(() => done());
      else requestAnimationFrame(check);
    };
    check();
  });
}

const FLIGHT: BoardOperation[] = [
  { kind: 'command', atMs: 0, overMs: null, command: { kind: 'simulate', id: 'shot' as never, simulation: { model: 'projectile', parameters: { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.8 } } } },
  { kind: 'command', atMs: 0, overMs: null, command: { kind: 'trackVector', id: 'side' as never, target: 'shot' as never, quantity: 'velocity-x', label: 'sideways' } },
  { kind: 'command', atMs: 0, overMs: null, command: { kind: 'trackVector', id: 'up' as never, target: 'shot' as never, quantity: 'velocity-y', label: 'up and down' } },
  { kind: 'command', atMs: 0, overMs: null, command: { kind: 'readout', id: 'how-high' as never, target: 'shot' as never, quantity: 'height' } },
  { kind: 'command', atMs: 0, overMs: null, command: { kind: 'slider', id: 'speed' as never, target: 'shot' as never, parameter: 'horizontalSpeed', min: 0, max: 10 } },
  { kind: 'command', atMs: 500, overMs: null, command: { kind: 'runSimulation', target: 'shot' as never, action: 'play' } },
];
const DRAG_SAMPLES = 6000;
const LONG_DRAG: BoardOperation[] = [...FLIGHT, ...Array.from({ length: DRAG_SAMPLES }, (_, index): BoardOperation => ({ kind: 'parameterSample', atMs: 1000 + index * 16, target: 'shot' as never, parameter: 'horizontalSpeed', value: 1 + (index % 800) / 100 }))];
const FIGURE_WIDTH = 712;
const FIGURE_HEIGHT = 512;

/** A frame's cost: the whole board's state and every mark, with nothing cached that a new value would miss. */
export function measureFigures(): Record<string, number[]> {
  const getMarks = (operations: BoardOperation[], id: string, atMs: number) => {
    const board = getBoardAt(operations, atMs);
    return getFigureMarks({ board, element: board.elements.get(id as never) as BoardElement, atMs, width: FIGURE_WIDTH, height: FIGURE_HEIGHT, isReducedMotion: false, words: BOARD_LABELS.figures });
  };
  const time = (work: (run: number) => void) => Array.from({ length: RENDER_RUNS }, (_, run) => {
    const start = performance.now();
    work(run);
    return performance.now() - start;
  });
  return {
    flightFrame: time((run) => getMarks(FLIGHT, 'shot', 600 + run * 20)),
    curveAtNewConstant: time((run) => getMarks([...FIRST_PLOT, { kind: 'parameterSample', atMs: 1, target: 'first' as never, parameter: 'a', value: 0.5 + run * 0.05 }], 'first', 9000)),
    curveAtRest: time(() => getMarks(FIRST_PLOT, 'first', 9000)),
    hardestCurve: time(() => sampleWorstCurve()),
    hardestCurvePlaced: time(() => placeHardestCurve()),
    flightFrameAfterLongDrag: time((run) => getMarks(LONG_DRAG, 'shot', 200_000 + run * 20)),
  };
}

function sampleWorstCurve(): void {
  const expression = 'tan(3000*x)+tan(3000*x)+tan(3000*x)+tan(3000*x)+tan(3000*x)+tan(3000*x)+tan(3000*x)+tan(3000*x)';
  const operations: BoardOperation[] = [{ kind: 'command', atMs: 0, overMs: null, command: { kind: 'plot', id: 'worst' as never, expression, domain: [-1000, 1000], yRange: [-1, 1] } }];
  const board = getBoardAt(operations, 9000);
  getFigureMarks({ board, element: board.elements.get('worst' as never) as BoardElement, atMs: 9000, width: FIGURE_WIDTH, height: FIGURE_HEIGHT, isReducedMotion: false, words: BOARD_LABELS.figures });
}

const HARDEST_EXPRESSION = `${'x+'.repeat(30)}sin(a*x)+cos(b*x)+tan(c*x)+sqrt(abs(d*x))+sin(a*x)+cos(b*x)+tan(c*x)+sqrt(abs(d*x))+sin(a*x)+cos(b*x)+tan(c*x)`;

// A new command each time, because placing one is what fits its y range through every value its constants can reach.
function placeHardestCurve(): void {
  const constants = ['a', 'b', 'c', 'd'].map((name) => ({ name, value: 1, min: 1, max: 2 }));
  const operations: BoardOperation[] = [{ kind: 'command', atMs: 0, overMs: null, command: { kind: 'plot', id: 'placed' as never, expression: HARDEST_EXPRESSION, constants, domain: [-50, 50] } }];
  const board = getBoardAt(operations, 9000);
  getFigureMarks({ board, element: board.elements.get('placed' as never) as BoardElement, atMs: 9000, width: FIGURE_WIDTH, height: FIGURE_HEIGHT, isReducedMotion: false, words: BOARD_LABELS.figures });
}

export async function measureRenders(): Promise<Record<string, number[]>> {
  const results: Record<string, number[]> = {};
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:0;top:700px;width:760px;font-size:20px';
  document.body.append(holder);
  for (const [name, tex] of Object.entries(RENDERS)) {
    results[name] = Array.from({ length: RENDER_RUNS }, (_, run) => {
      const wrapper = document.createElement('div');
      holder.append(wrapper);
      const painter = createMathPainter(wrapper);
      const start = performance.now();
      painter.prepare({ line: startMathLine(`${tex} ${' '.repeat(run % 2)}`), morphFrom: null, progress: 1, maxWidth: 712, isReducedMotion: false });
      const spentMs = performance.now() - start;
      painter.remove();
      wrapper.remove();
      return spentMs;
    });
  }
  return results;
}
