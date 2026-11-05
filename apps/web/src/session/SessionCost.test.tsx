import { execFile } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SessionCost, { formatCost, formatNaira } from './SessionCost';

const run = promisify(execFile);
const COST_LINE_MARK = 'session-cost';
const WEB_FOLDER = resolve(process.cwd());
const BUILD_LIMIT_MS = 120_000;

async function buildHolds(extraEnv: Record<string, string>): Promise<boolean> {
  const outDir = mkdtempSync(join(tmpdir(), 'astra-cost-build-'));
  try {
    await run(join(WEB_FOLDER, 'node_modules/.bin/vite'), ['build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'silent'], {
      cwd: WEB_FOLDER,
      env: { ...process.env, VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'build-check', VITE_SHOW_COST: '', NODE_ENV: 'production', ...extraEnv },
    });
    const scripts = readdirSync(join(outDir, 'assets')).filter((name) => name.endsWith('.js'));
    return scripts.some((name) => readFileSync(join(outDir, 'assets', name), 'latin1').includes(COST_LINE_MARK));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

describe('the cost line', () => {
  it('says what it is, in dollars and naira, in small quiet numbers', () => {
    render(<SessionCost usd={0.0426} />);
    const cost = screen.getByTestId(COST_LINE_MARK);
    expect(cost.textContent).toBe('$0.043 · ₦57');
    expect(cost.title).toContain('estimate');
    expect(cost.title).toContain('₦1,330 to $1');
    expect(formatCost(1.5)).toBe('$1.50');
    expect(formatNaira(1.5)).toBe('₦1,995');
    expect(formatNaira(1.5, 1500)).toBe('₦2,250');
  });

  it('is in no build unless a tester asked for it', async () => {
    await expect(buildHolds({})).resolves.toBe(false);
    await expect(buildHolds({ VITE_SHOW_COST: '1' })).resolves.toBe(true);
  }, BUILD_LIMIT_MS);
});
