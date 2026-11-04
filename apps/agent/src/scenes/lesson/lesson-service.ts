import { readFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { initializeLogger } from '@livekit/agents';
import { AccessToken } from 'livekit-server-sdk';
import { readKey } from '../../lab/keys.ts';
import { makeTutorVoice, TUTOR_VOICE_NAME } from '../../providers/choose.ts';
import { makeAnthropicSceneModels, type SceneModels } from '../../providers/anthropic.scenes.ts';
import { makeRenderedVoice } from '../../providers/fakes.ts';
import { createContainerWorker } from '../render-worker.ts';
import { getSceneStoreRoot } from '../scene-settings.ts';
import { createSceneStore } from '../scene-store.ts';
import type { LessonPlan } from '../scene-types.ts';
import { createSpendLedger } from '../spend-ledger.ts';
import { makeFakeSceneModels } from './fake-models.ts';
import { createLessonDesk, type LessonRequest, parseLessonRequest } from './lesson-desk.ts';
import { createLessonWork } from './lesson-work.ts';
import { installCrashGuards, startTiedChild } from './process-guards.ts';
import { runLesson } from './run-lesson.ts';
import { createTopicRuns } from './topic-runs.ts';
import { createLessonVoice } from './voice-takes.ts';

const DEV_KEY = 'devkey';
const DEV_SECRET = 'secret';
const SERVICE_PORT = Number(process.env.SCENE_LESSON_PORT ?? 7975);
const LIVEKIT_PORT = Number(process.env.LESSON_LIVEKIT_PORT ?? 7970);
const LIVEKIT_URL = `ws://127.0.0.1:${LIVEKIT_PORT}`;
const MOST_BODY_CHARACTERS = 16_000;
const TOO_MANY_REQUESTS = 429;
const NO_STUDENT = 'no-student';
const SERVER_CONFIG = `port: ${LIVEKIT_PORT}\nrtc:\n  udp_port: ${LIVEKIT_PORT + 2}\n  tcp_port: ${LIVEKIT_PORT + 1}\n  use_external_ip: false\nkeys:\n  ${DEV_KEY}: ${DEV_SECRET}\nlogging:\n  level: warn\n`;

const isFake = process.env.LESSON_FAKES === '1';
const storeRoot = getSceneStoreRoot();
const ledger = createSpendLedger(process.env.LESSON_SPEND_FILE ?? join(storeRoot, 'lesson-spend.jsonl'), {
  limitUsd: Number(process.env.LESSON_SPEND_LIMIT ?? 20),
  studentLimitUsd: Number(process.env.LESSON_STUDENT_SPEND_LIMIT ?? 2),
  voiceCharacterLimit: Number(process.env.LESSON_VOICE_TOTAL_LIMIT ?? 20_000),
  studentVoiceCharacterLimit: Number(process.env.LESSON_VOICE_CHARACTER_LIMIT ?? 1500),
});
// Each lesson's model calls run inside its own context, so spending lands on the student who started the work, even across a shared topic run.
const payingStudent = new AsyncLocalStorage<string>();
const getPayingStudent = () => payingStudent.getStore() ?? NO_STUDENT;

function withFixedWords(models: SceneModels, planFile: string | undefined): SceneModels {
  if (!planFile) return models;
  const plan = JSON.parse(readFileSync(planFile, 'utf8')) as LessonPlan;
  return { ...models, planner: { plan: async () => ({ ...plan, model: 'fixed', ms: 0, costUsd: 0 }) } };
}

function makeModels(): SceneModels {
  const models = isFake ? makeFakeSceneModels() : makeAnthropicSceneModels({ apiKey: readKey('ANTHROPIC_API_KEY'), onUsage: ledger.getUsageListener(getPayingStudent), assertRoom: () => ledger.assertRoom(getPayingStudent()) });
  return withFixedWords(models, process.env.LESSON_PLAN_FILE);
}

function makeVoices() {
  if (process.env.LESSON_VOICE === 'tone') return createLessonVoice({ root: storeRoot, voiceName: 'tone', makeLiveTts: () => makeRenderedVoice({ name: 'tone' }).makeTts(), ledger, isFree: true });
  return createLessonVoice({ root: storeRoot, voiceName: TUTOR_VOICE_NAME, makeLiveTts: () => makeTutorVoice({ apiKey: readKey('ELEVENLABS_API_KEY') }).makeTts(), ledger });
}

const makeToken = ({ room, identity, canPublish }: { room: string; identity: string; canPublish: boolean }) => {
  const token = new AccessToken(DEV_KEY, DEV_SECRET, { identity, ttl: '10m' });
  token.addGrant({ room, roomJoin: true, canPublish, canSubscribe: true, canPublishData: true, canUpdateOwnMetadata: false });
  return token.toJwt();
};

// The least a page needs in a stand-in lesson, which takes no microphone: this one room, the tutor's voice, and the data channel.
const makeStudentToken = (room: string, identity: string) => makeToken({ room, identity, canPublish: false });

const log = (name: string, detail: object = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), name, ...detail }));

const models = makeModels();
const voices = makeVoices();
const store = createSceneStore(storeRoot);
const runs = createTopicRuns({ planner: models.planner, nameReader: models.nameReader, writers: [models.writer, models.fallbackWriter], reviewer: models.reviewer, worker: createContainerWorker(), store });

const runOneLesson = ({ sessionId, studentId, request, isCard, cardLine, onClosing, onPresence }: LessonRequest & { onClosing(): void; onPresence(isHere: boolean): void }) =>
  payingStudent.run(studentId, async () => {
    const startedAtMs = performance.now();
    const work = createLessonWork({ router: models.router, runs, store, request, isCard, studentId, cardLine, getNowMs: () => performance.now(), onChange: (state, atMs) => log('scene', { sessionId, state: state.kind, afterMs: Math.round(atMs - startedAtMs), ...(state.kind === 'failed' ? { reasons: state.reasons } : {}), ...(state.kind === 'ready' ? { trace: state.scene.trace } : {}) }) });
    try {
      await runLesson({ url: LIVEKIT_URL, token: await makeToken({ room: `lesson-${sessionId}`, identity: 'agent-tutor', canPublish: true }), work, voice: voices.forStudent(studentId, work.getVoiceShelf), onClosing, onPresence, onEvent: (name, detail) => log(name, { sessionId, afterMs: Math.round(performance.now() - startedAtMs), ...detail }) });
    } finally {
      work.leave();
    }
  });

const desk = createLessonDesk({ run: runOneLesson, makeToken: makeStudentToken, ledger, getNowMs: () => Date.now(), url: LIVEKIT_URL, onFailed: (sessionId, error) => log('lessonFailed', { sessionId, error: String(error) }) });

async function answer(body: string, response: ServerResponse): Promise<void> {
  const request = parseLessonRequest(body);
  if (!request) {
    response.writeHead(400).end();
    return;
  }
  const reply = await desk.start(request);
  response.writeHead('refused' in reply ? TOO_MANY_REQUESTS : 200, { 'Content-Type': 'application/json' }).end(JSON.stringify(reply));
}

initializeLogger({ pretty: false, level: 'warn' });
installCrashGuards((name, error) => log(name, { error: String(error) }));
startTiedChild('livekit-server', ['--config-body', SERVER_CONFIG, '--bind', '127.0.0.1']);
const server = createServer((request, response) => {
  let body = '';
  request.on('data', (chunk: Buffer) => {
    if (body.length < MOST_BODY_CHARACTERS) body += chunk.toString();
  });
  request.on('end', () => {
    if (request.method !== 'POST' || request.url !== '/lessons') {
      response.writeHead(404).end();
      return;
    }
    void answer(body, response).catch((error: unknown) => response.writeHead(500).end(String(error)));
  });
});
server.listen(SERVICE_PORT, '127.0.0.1', () => log('listening', { port: SERVICE_PORT, liveKit: LIVEKIT_URL, isFake }));
const stopAll = () => {
  log('stopped', { spent: ledger.read() });
  process.exit(0);
};
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
