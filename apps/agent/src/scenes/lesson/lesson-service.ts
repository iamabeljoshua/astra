import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { initializeLogger } from '@livekit/agents';
import { AccessToken } from 'livekit-server-sdk';
import { readKey } from '../../lab/keys.ts';
import { makeTutorVoice, TUTOR_VOICE_NAME } from '../../providers/choose.ts';
import { makeAnthropicSceneModels, type SceneModels } from '../../providers/anthropic.scenes.ts';
import { makeRenderedVoice } from '../../providers/fakes.ts';
import { createSpendLedger } from '../proof/spend-ledger.ts';
import { createContainerWorker } from '../render-worker.ts';
import { getSceneStoreRoot } from '../scene-settings.ts';
import { createSceneStore } from '../scene-store.ts';
import type { LessonPlan } from '../scene-types.ts';
import { createLessonWork } from './lesson-work.ts';
import { makeFakeSceneModels } from './fake-models.ts';
import { runLesson } from './run-lesson.ts';
import { createLessonVoice } from './voice-takes.ts';

const DEV_KEY = 'devkey';
const DEV_SECRET = 'secret';
const SERVICE_PORT = Number(process.env.SCENE_LESSON_PORT ?? 7975);
const LIVEKIT_PORT = Number(process.env.LESSON_LIVEKIT_PORT ?? 7970);
const LIVEKIT_URL = `ws://127.0.0.1:${LIVEKIT_PORT}`;
const CHARACTER_LIMIT = Number(process.env.LESSON_VOICE_CHARACTER_LIMIT ?? 1500);
const SERVER_CONFIG = `port: ${LIVEKIT_PORT}\nrtc:\n  udp_port: ${LIVEKIT_PORT + 2}\n  tcp_port: ${LIVEKIT_PORT + 1}\n  use_external_ip: false\nkeys:\n  ${DEV_KEY}: ${DEV_SECRET}\nlogging:\n  level: warn\n`;

const isFake = process.env.LESSON_FAKES === '1';
const spendPath = process.env.LESSON_SPEND_FILE;
const ledger = spendPath ? createSpendLedger({ path: spendPath, limitUsd: Number(process.env.LESSON_SPEND_LIMIT ?? 5.5), note: 'lesson' }) : null;

// A proof can fix the tutor's words, so its voice comes from kept takes and spends no credits, while the scene is still written live.
function withFixedWords(models: SceneModels, planFile: string | undefined): SceneModels {
  if (!planFile) return models;
  const plan = JSON.parse(readFileSync(planFile, 'utf8')) as LessonPlan;
  return { ...models, planner: { plan: async () => ({ ...plan, model: 'fixed', ms: 0, costUsd: 0 }) } };
}

function makeModels(): SceneModels {
  const models = isFake ? makeFakeSceneModels() : makeAnthropicSceneModels({ apiKey: readKey('ANTHROPIC_API_KEY'), onUsage: ledger?.onUsage });
  return withFixedWords(models, process.env.LESSON_PLAN_FILE);
}

function makeVoice() {
  if (process.env.LESSON_VOICE === 'tone') return createLessonVoice({ root: getSceneStoreRoot(), voiceName: 'tone', makeLiveTts: () => makeRenderedVoice({ name: 'tone' }).makeTts(), characterLimit: Number.POSITIVE_INFINITY });
  return createLessonVoice({ root: getSceneStoreRoot(), voiceName: TUTOR_VOICE_NAME, makeLiveTts: () => makeTutorVoice({ apiKey: readKey('ELEVENLABS_API_KEY') }).makeTts(), characterLimit: CHARACTER_LIMIT });
}

const makeToken = (room: string, identity: string) => {
  const token = new AccessToken(DEV_KEY, DEV_SECRET, { identity, ttl: '30m' });
  token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return token.toJwt();
};

const models = makeModels();
const voice = makeVoice();
const store = createSceneStore(getSceneStoreRoot());
const worker = createContainerWorker();
const running = new Map<string, Promise<void>>();

const log = (name: string, detail: object = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), name, ...detail }));

async function startLesson({ sessionId, request, isCard }: { sessionId: string; request: string; isCard: boolean }): Promise<{ url: string; token: string }> {
  const room = `lesson-${sessionId}`;
  if (!running.has(sessionId)) {
    const startedAtMs = performance.now();
    const work = createLessonWork({ router: models.router, planner: models.planner, writers: [models.writer, models.fallbackWriter], reviewer: models.reviewer, worker, store, request, isCard, getNowMs: () => performance.now(), onChange: (state, atMs) => log('scene', { sessionId, state: state.kind, afterMs: Math.round(atMs - startedAtMs), ...(state.kind === 'failed' ? { reasons: state.reasons } : {}), ...(state.kind === 'ready' ? { trace: state.scene.trace } : {}) }) });
    const lesson = runLesson({ url: LIVEKIT_URL, token: await makeToken(room, 'agent-tutor'), work, voice, onEvent: (name, detail) => log(name, { sessionId, afterMs: Math.round(performance.now() - startedAtMs), ...detail }) })
      .catch((error: unknown) => log('lessonFailed', { sessionId, error: String(error) }))
      .finally(() => running.delete(sessionId));
    running.set(sessionId, lesson);
  }
  return { url: LIVEKIT_URL, token: await makeToken(room, `student-${sessionId}`) };
}

function startLiveKit(): ChildProcess {
  return spawn('livekit-server', ['--config-body', SERVER_CONFIG, '--bind', '127.0.0.1'], { stdio: 'ignore' });
}

initializeLogger({ pretty: false, level: 'warn' });
const liveKit = startLiveKit();
// Local only, and a dev key, because this stands in until M3.6's live room.
const server = createServer((request, response) => {
  let body = '';
  request.on('data', (chunk: Buffer) => (body += chunk.toString()));
  request.on('end', () => {
    if (request.method !== 'POST' || request.url !== '/lessons') {
      response.writeHead(404).end();
      return;
    }
    void startLesson(JSON.parse(body) as { sessionId: string; request: string; isCard: boolean }).then(
      (reply) => response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(reply)),
      (error: unknown) => response.writeHead(500).end(String(error)),
    );
  });
});
server.listen(SERVICE_PORT, '127.0.0.1', () => log('listening', { port: SERVICE_PORT, liveKit: LIVEKIT_URL, isFake }));
const stopAll = () => {
  liveKit.kill('SIGKILL');
  log('stopped', { liveCharacters: voice.getLiveCharacters() });
  process.exit(0);
};
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
