declare global {
  interface Window {
    mathLoad: { importMs: number; firstEquationMs: number; rendersMs: Record<string, number[]> } | null;
  }
}

window.mathLoad = null;

const startMs = performance.now();
void import('./board').then(async ({ showFirstEquation, measureRenders }) => {
  const importMs = performance.now() - startMs;
  await showFirstEquation(document.getElementById('root') as HTMLElement);
  const firstEquationMs = performance.now() - startMs;
  window.mathLoad = { importMs, firstEquationMs, rendersMs: await measureRenders() };
});

export {};
