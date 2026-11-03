import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

// Two `supabase start` commands at once fail and prune each other's containers, so a held port makes them take turns.
const START_LOCK_PORT = 54428;
const START_LOCK_TIMEOUT_MS = 180_000;
const START_LOCK_RETRY_MS = 500;
const DEV_ACCOUNTS_URL = new URL('./dev-accounts.json', import.meta.url);
const WEB_ENV_URL = new URL('../apps/web/.env.development.local', import.meta.url);
const EMAIL_ALREADY_USED_STATUS = 422;

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

function readStackValues() {
  const { stdout, status } = spawnSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' });
  if (status !== 0) throw new Error('`supabase status` failed, so the stack did not start.');
  return Object.fromEntries([...stdout.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map(([, name, value]) => [name, value]));
}

async function createDevAccount({ apiUrl, secretKey, password, account }) {
  const response = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: secretKey, authorization: `Bearer ${secretKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...account, password, email_confirm: true }),
  });
  if (!response.ok && response.status !== EMAIL_ALREADY_USED_STATUS) {
    throw new Error(`Could not create ${account.email}: ${response.status}.`);
  }
}

async function prepareForSignIn() {
  const { API_URL: apiUrl, PUBLISHABLE_KEY: publishableKey, SECRET_KEY: secretKey } = readStackValues();
  const { password, accounts } = JSON.parse(readFileSync(DEV_ACCOUNTS_URL, 'utf8'));
  for (const account of accounts) {
    await createDevAccount({ apiUrl, secretKey, password, account });
  }
  writeFileSync(
    WEB_ENV_URL,
    `# Written by pnpm db:up.\nVITE_SUPABASE_URL=${apiUrl}\nVITE_SUPABASE_PUBLISHABLE_KEY=${publishableKey}\n`,
  );
}

const lock = await waitForStartLock();
const { status, error } = spawnSync('supabase', ['start'], { stdio: 'inherit' });
lock.close();
if (error) console.error(`Cannot run the Supabase CLI: ${error.message}. Run pnpm install, then use pnpm db:up.`);
process.exitCode = status ?? 1;
if (status === 0) {
  await prepareForSignIn().catch((failure) => {
    console.error(`Could not prepare sign-in: ${failure.message} An interrupted start can leave Postgres running alone. If nothing else is using the stack, run pnpm exec supabase stop, then pnpm db:up. The stop affects every worktree.`);
    process.exitCode = 1;
  });
}
