import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

// Two `supabase start` commands at once fail and prune each other's containers, so a held port makes them take turns.
const START_LOCK_PORT = 54428;
const START_LOCK_TIMEOUT_MS = 180_000;
const START_LOCK_RETRY_MS = 500;

function tryHoldPort(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (error) =>
      error.code === 'EADDRINUSE' ? resolve(undefined) : reject(error),
    );
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function waitForStartLock() {
  const giveUpAt = Date.now() + START_LOCK_TIMEOUT_MS;
  while (Date.now() < giveUpAt) {
    const lock = await tryHoldPort(START_LOCK_PORT);
    if (lock) return lock;
    await sleep(START_LOCK_RETRY_MS);
  }
  throw new Error(`Another pnpm db:up still holds port ${START_LOCK_PORT}.`);
}

const lock = await waitForStartLock();
const { status } = spawnSync('supabase', ['start'], { stdio: 'inherit' });
lock.close();
process.exitCode = status ?? 1;
