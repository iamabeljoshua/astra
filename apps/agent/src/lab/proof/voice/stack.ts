import { type ChildProcess, spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readKey } from '../../keys.ts';

export const REPO_ROOT = resolve(fileURLToPath(new URL('../../../../../..', import.meta.url)));
export const WEB_PORT = Number(process.env.WEB_PORT ?? 6310);
export const API_PORT = Number(process.env.API_PORT ?? 3310);
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const AGENT_PORT = Number(process.env.ASTRA_AGENT_PORT ?? 8391);
export const AGENT_NAME = process.env.ASTRA_AGENT_NAME ?? 'astra-tutor-m3-6';
const DEFAULT_DATABASE = 'postgresql://postgres:postgres@127.0.0.1:54422/astra_m3_6';

const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function waitFor(url: string, limitMs: number): Promise<void> {
  const deadline = Date.now() + limitMs;
  for (;;) {
    const isUp = await fetch(url).then(() => true, () => false);
    if (isUp) return;
    if (Date.now() > deadline) throw new Error(`${url} did not answer within ${limitMs} ms`);
    await delay(300);
  }
}

function getLiveKeys() {
  return { LIVEKIT_URL: readKey('LIVEKIT_URL'), LIVEKIT_API_KEY: readKey('LIVEKIT_API_KEY'), LIVEKIT_API_SECRET: readKey('LIVEKIT_API_SECRET'), ASTRA_AGENT_NAME: AGENT_NAME };
}

function spawnLogged(command: string, args: string[], { logPath, env, cwd = REPO_ROOT }: { logPath: string; env: NodeJS.ProcessEnv; cwd?: string }): ChildProcess {
  const log = openSync(logPath, 'a');
  const child = spawn(command, args, { cwd, stdio: ['ignore', log, log], env: { ...process.env, ...env }, detached: true });
  closeSync(log);
  return child;
}

export interface VoiceStack {
  traceFolder: string;
  startAgent(env?: NodeJS.ProcessEnv): Promise<void>;
  stopAgent(): Promise<void>;
  stop(): Promise<void>;
}

async function killGroup(child: ChildProcess | null): Promise<void> {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    return;
  }
  await delay(1500);
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    return;
  }
}

// Starts what a student's session needs on this lane's own ports, on the real LiveKit Cloud project.
export async function startVoiceStack({ out, agentEnv = {} }: { out: string; agentEnv?: NodeJS.ProcessEnv }): Promise<VoiceStack> {
  mkdirSync(out, { recursive: true });
  const traceFolder = join(out, 'trace');
  const started: ChildProcess[] = [];
  const baseEnv = { WEB_PORT: String(WEB_PORT), API_PORT: String(API_PORT), DATABASE_URL: process.env.DATABASE_URL ?? DEFAULT_DATABASE };
  const isApiUp = await fetch(`http://127.0.0.1:${API_PORT}/health`).then(() => true, () => false);
  if (!isApiUp) started.push(spawnLogged('pnpm', ['--filter', '@astra/api', 'dev'], { logPath: join(out, 'api.log'), env: { ...baseEnv, ...getLiveKeys() } }));
  const isWebUp = await fetch(WEB_URL).then(() => true, () => false);
  if (!isWebUp) started.push(spawnLogged('pnpm', ['--filter', '@astra/web', 'exec', 'vite', '--host', '127.0.0.1'], { logPath: join(out, 'web.log'), env: baseEnv }));
  await waitFor(`http://127.0.0.1:${API_PORT}/health`, 120_000);
  await waitFor(WEB_URL, 60_000);

  let agent: ChildProcess | null = null;
  const stack: VoiceStack = {
    traceFolder,
    async startAgent(env = {}) {
      agent = spawnLogged('pnpm', ['--filter', '@astra/agent', 'start'], {
        logPath: join(out, 'agent.log'),
        env: { ...baseEnv, ...getLiveKeys(), ASTRA_TUTOR_MODEL: process.env.ASTRA_TUTOR_MODEL ?? 'stand-in', ASTRA_VOICE_TRACE: traceFolder, ASTRA_VOICE_TRACE_WORDS: '1', ASTRA_AGENT_PORT: String(AGENT_PORT), ...agentEnv, ...env },
      });
      await waitFor(`http://127.0.0.1:${AGENT_PORT}/`, 60_000);
    },
    async stopAgent() {
      await killGroup(agent);
      agent = null;
    },
    async stop() {
      await stack.stopAgent();
      await Promise.all(started.map(killGroup));
    },
  };
  await stack.startAgent();
  return stack;
}
