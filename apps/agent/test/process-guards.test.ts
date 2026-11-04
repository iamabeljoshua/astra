import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const FIXTURE = join(import.meta.dirname, 'fixtures/tied-parent.ts');
const started: ChildProcess[] = [];

function startParent(mode = '') {
  const parent = spawn(process.execPath, [FIXTURE, mode, CHILD_SECONDS], { stdio: ['ignore', 'pipe', 'inherit'] });
  started.push(parent);
  const lines: Record<string, unknown>[] = [];
  parent.stdout.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(line) as Record<string, unknown>);
  });
  return { parent, lines };
}

const CHILD_SECONDS = String(30_000 + Math.floor(Math.random() * 30_000));
const CHILD_COMMAND = `^sleep ${CHILD_SECONDS}$`;
const isChildRunning = () => {
  try {
    execFileSync('pgrep', ['-f', CHILD_COMMAND], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};

describe('the process that runs lessons', () => {
  afterEach(() => {
    for (const parent of started.splice(0)) parent.kill('SIGKILL');
  });

  it.each(['SIGKILL', 'SIGTERM'] as const)('takes its LiveKit child with it on %s', async (signal) => {
    const { parent, lines } = startParent();
    await vi.waitFor(() => expect(lines[0]?.childPid).toBeGreaterThan(0), { timeout: 8000 });
    await vi.waitFor(() => expect(isChildRunning()).toBe(true), { timeout: 5000 });
    parent.kill(signal);
    await vi.waitFor(() => expect(isChildRunning()).toBe(false), { timeout: 5000 });
  });

  it.each(['throw', 'reject'])('stays up and keeps its child when one lesson %ss', async (mode) => {
    const { lines } = startParent(mode);
    await vi.waitFor(() => expect(lines.some((line) => line.name === 'uncaught')).toBe(true), { timeout: 8000 });
    const countAtFailure = lines.filter((line) => line.alive).length;
    await vi.waitFor(() => expect(lines.filter((line) => line.alive).length).toBeGreaterThan(countAtFailure + 2), { timeout: 5000 });
    expect(isChildRunning()).toBe(true);
  });
});
