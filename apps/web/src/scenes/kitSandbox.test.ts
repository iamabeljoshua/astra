import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const run = promisify(execFile);
const REPO_ROOT = join(import.meta.dirname, '../../../..');
const LONGEST_RUN_MS = 180_000;

it(
  'stops a spinning scene and keeps a scene from the network, cookies, and the page',
  async () => {
    // CI installs this browser in a step beside these tests, so this waits on that install's lock. --no-remove keeps browsers other checkouts on a machine use.
    await run('pnpm', ['exec', 'playwright', 'install', 'chromium', '--no-remove'], { cwd: REPO_ROOT });
    const { stdout } = await run(process.execPath, ['scripts/check-kit-sandbox.ts'], { cwd: REPO_ROOT });
    expect(stdout).toContain('The sandbox held.');
  },
  LONGEST_RUN_MS,
);
