import { createRoot } from 'react-dom/client';

declare global {
  interface Window {
    mathLoad: { importMs: number; firstEquationMs: number; rendersMs: Record<string, number[]>; figuresMs: Record<string, number[]> } | null;
  }
}

window.mathLoad = null;

// Home has already loaded React, so it stays out of the board's bytes here too.
const startMs = performance.now();
void import('./board').then(async ({ showFirstEquation, showFirstPlot, measureRenders, measureFigures }) => {
  const importMs = performance.now() - startMs;
  const show = new URLSearchParams(location.search).get('first') === 'plot' ? showFirstPlot : showFirstEquation;
  await show(createRoot(document.getElementById('root') as HTMLElement));
  const firstEquationMs = performance.now() - startMs;
  window.mathLoad = { importMs, firstEquationMs, rendersMs: await measureRenders(), figuresMs: measureFigures() };
});
