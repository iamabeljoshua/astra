import { type BoardOperation, getBoardAt, startMathLine } from '@astra/board';
import { createMathPainter } from '@astra/board/drawing';
import type { Root } from 'react-dom/client';
import { BoardView } from '../src/lab/BoardView';

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
