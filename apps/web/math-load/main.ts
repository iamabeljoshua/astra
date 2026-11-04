import { createRoot } from 'react-dom/client';

declare global {
  interface Window {
    mathLoad: { importMs: number; firstEquationMs: number; rendersMs: Record<string, number[]> } | null;
  }
}

window.mathLoad = null;

// Home has already loaded React, so it stays out of the board's bytes here too.
const startMs = performance.now();
void import('./board').then(async ({ showFirstEquation, measureRenders }) => {
  const importMs = performance.now() - startMs;
  await showFirstEquation(createRoot(document.getElementById('root') as HTMLElement));
  const firstEquationMs = performance.now() - startMs;
  window.mathLoad = { importMs, firstEquationMs, rendersMs: await measureRenders() };
});
