import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import type { SweepRequest, SweepResult } from '../../apps/web/src/lab/deck/deckSweep.ts';

interface ViewportPlan {
  name: string;
  viewport: { width: number; height: number };
  boards: { name: string; width: number; height: number }[];
}

const VIEWPORTS: readonly ViewportPlan[] = [
  { name: 'laptop', viewport: { width: 1366, height: 800 }, boards: [{ name: 'laptop', width: 760, height: 752 }, { name: 'laptop-wide-short', width: 1100, height: 420 }] },
  { name: 'desktop', viewport: { width: 1920, height: 1080 }, boards: [{ name: 'desktop', width: 1100, height: 1000 }] },
  { name: 'small-laptop', viewport: { width: 1024, height: 640 }, boards: [{ name: 'small-laptop', width: 580, height: 592 }] },
  { name: 'tablet', viewport: { width: 768, height: 1024 }, boards: [{ name: 'tablet', width: 736, height: 600 }] },
  { name: 'phone', viewport: { width: 390, height: 844 }, boards: [{ name: 'phone', width: 358, height: 506 }, { name: 'phone-full', width: 390, height: 800 }] },
  { name: 'small-phone', viewport: { width: 320, height: 568 }, boards: [{ name: 'small-phone', width: 288, height: 340 }] },
  { name: 'fold', viewport: { width: 280, height: 653 }, boards: [{ name: 'fold', width: 280, height: 392 }] },
  { name: 'phone-landscape', viewport: { width: 844, height: 390 }, boards: [{ name: 'phone-landscape', width: 480, height: 340 }] },
];

const THEMES = ['light', 'dark'] as const;
const QUICK_PLANS = [{ viewport: 'laptop', theme: 'light', boards: ['laptop'] }, { viewport: 'phone', theme: 'dark', boards: ['phone'] }] as const;
const REDUCED_MOTION_VIEWPORTS = ['laptop', 'phone'];
const FAILURE_LINES_SHOWN = 40;

interface SweepOptions {
  isQuick: boolean;
  scenes?: readonly string[];
  outFolder: string;
}

interface Totals extends SweepResult {
  sweeps: string[];
}

interface Verdict {
  failures: string[];
  lines: string[];
}

async function sweepAt(page: Page, plan: ViewportPlan, request: Omit<SweepRequest, 'sizes'> & { sizes?: SweepRequest['sizes'] }): Promise<SweepResult> {
  await page.setViewportSize(plan.viewport);
  return page.evaluate((sweep) => (window.boardDeck as NonNullable<Window['boardDeck']>).sweep(sweep), { ...request, sizes: request.sizes ?? plan.boards });
}

function addResult(totals: Totals, name: string, result: SweepResult): void {
  totals.renders += result.renders;
  totals.textsChecked += result.textsChecked;
  totals.failures.push(...result.failures);
  totals.tooSmallReported.push(...result.tooSmallReported);
  totals.wordsReported.push(...result.wordsReported);
  totals.sweeps.push(`${name}: ${result.renders} renders, ${result.failures.length} with a defect`);
}

async function runQuickSweeps(page: Page, options: SweepOptions, totals: Totals): Promise<void> {
  for (const plan of QUICK_PLANS) {
    const viewport = VIEWPORTS.find(({ name }) => name === plan.viewport) as ViewportPlan;
    const sizes = viewport.boards.filter(({ name }) => (plan.boards as readonly string[]).includes(name));
    addResult(totals, `${plan.viewport} ${plan.theme}`, await sweepAt(page, viewport, { sizes, theme: plan.theme, scenes: options.scenes }));
  }
}

async function runFullSweeps(page: Page, options: SweepOptions, totals: Totals): Promise<void> {
  for (const plan of VIEWPORTS) {
    for (const theme of THEMES) addResult(totals, `${plan.name} ${theme}`, await sweepAt(page, plan, { theme, scenes: options.scenes }));
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const name of REDUCED_MOTION_VIEWPORTS) {
    const plan = VIEWPORTS.find((candidate) => candidate.name === name) as ViewportPlan;
    addResult(totals, `${name} reduced motion`, await sweepAt(page, plan, { theme: 'light', scenes: options.scenes }));
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

function summarise(totals: Totals, verdict: Verdict): void {
  const counts = new Map<string, number>();
  for (const { defects } of totals.failures) for (const { kind } of defects) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  verdict.lines.push(...totals.sweeps);
  verdict.lines.push(`Sweep total: ${totals.renders} renders, ${totals.textsChecked} text boxes, ${totals.failures.length} renders with a defect`);
  verdict.lines.push(`Reported to the tutor and left out of the defects: ${totals.tooSmallReported.length} elements too small to read, ${totals.wordsReported.length} labels with no room`);
  if (counts.size > 0) verdict.lines.push(`Defects by kind: ${[...counts].map(([kind, count]) => `${kind} ${count}`).join(', ')}`);
  for (const failure of totals.failures.slice(0, FAILURE_LINES_SHOWN)) verdict.failures.push(`${failure.scene} at ${failure.size} ${failure.theme}, ${Math.round(failure.atMs)} ms: ${failure.defects.map(({ kind, detail }) => `${kind} (${detail})`).join('; ')}`);
  if (totals.failures.length > FAILURE_LINES_SHOWN) verdict.failures.push(`and ${totals.failures.length - FAILURE_LINES_SHOWN} more renders with a defect`);
}

export async function runSweeps(page: Page, options: SweepOptions, verdict: Verdict): Promise<void> {
  const totals: Totals = { renders: 0, textsChecked: 0, failures: [], tooSmallReported: [], wordsReported: [], sweeps: [] };
  const startedAtMs = Date.now();
  if (options.isQuick) await runQuickSweeps(page, options, totals);
  else await runFullSweeps(page, options, totals);
  verdict.lines.push(`Sweeps took ${Math.round((Date.now() - startedAtMs) / 1000)} s`);
  summarise(totals, verdict);
  const nonHostile = new Set(totals.tooSmallReported.filter((entry) => !entry.startsWith('hostile-')));
  if (nonHostile.size > 0) verdict.lines.push(`Too small to read outside the hostile scenes: ${[...nonHostile].join(', ')}`);
  mkdirSync(options.outFolder, { recursive: true });
  writeFileSync(join(options.outFolder, 'sweep-results.json'), JSON.stringify(totals, null, 1));
}
