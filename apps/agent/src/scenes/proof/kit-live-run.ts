import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readKey } from '../../keys.ts';
import { makeAnthropicSceneModels } from '../../providers/anthropic.scenes.ts';
import { KIT_ASK_LIMIT_MS } from '../scene-desk.ts';
import { getKitCodeProblems } from '../kit-code-check.ts';
import { createFrameCheck, createKitWorker } from '../kit-worker.ts';
import { createLessonWork } from '../lesson/lesson-work.ts';
import { createTopicRuns, type TopicRuns } from '../lesson/topic-runs.ts';
import { createSceneStore } from '../scene-store.ts';

const { values: args } = parseArgs({
  options: {
    questions: { type: 'string' },
    ask: { type: 'string', multiple: true },
    out: { type: 'string' },
    ledger: { type: 'string' },
    student: { type: 'string', default: 'kit-proof' },
    limitUsd: { type: 'string', default: '1' },
    waitS: { type: 'string', default: '100' },
  },
});

const out = args.out as string;
mkdirSync(out, { recursive: true });
const ledger = args.ledger as string;
const limitUsd = Number(args.limitUsd);
const previousUsd = (() => {
  try {
    return readFileSync(ledger, 'utf8').trim().split('\n').reduce((sum, line) => sum + ((JSON.parse(line) as { costUsd?: number }).costUsd ?? 0), 0);
  } catch {
    return 0;
  }
})();
let spentUsd = 0;
let questionUsd = 0;
const models = makeAnthropicSceneModels({
  apiKey: readKey('ANTHROPIC_API_KEY'),
  assertRoom: () => {
    if (previousUsd + spentUsd >= limitUsd) throw new Error(`stopped at the $${limitUsd} ledger limit`);
  },
  onUsage: ({ role, model, ms, costUsd }) => {
    spentUsd += costUsd;
    questionUsd += costUsd;
    appendFileSync(ledger, `${JSON.stringify({ role, model, ms: Math.round(ms), costUsd, atMs: Date.now() })}\n`);
  },
});
const store = createSceneStore(process.env.SCENE_STORE_DIR as string);
const warn = (line: string) => console.log(`  ${line.slice(0, 400)}`);
const checkFrames = createKitWorker(createFrameCheck());
let attemptNumber = 0;
const worker: typeof checkFrames = (job, signal) => {
  attemptNumber += 1;
  writeFileSync(join(out, `attempt-${attemptNumber}.js`), job.code);
  return checkFrames(job, signal);
};
const kitRuns = createTopicRuns({ engine: 'kit', themes: ['dark'], checkCode: getKitCodeProblems, planner: models.planner, nameReader: models.nameReader, writers: [models.kitWriter, models.kitFallbackWriter], repairWriter: models.kitFallbackWriter, reviewer: models.kitReviewer, worker, store, warn });
const noManimRuns = { join: () => ({ plan: Promise.resolve('nothing'), firstLine: Promise.resolve(null), getScene: async () => ({ isOk: false, reasons: ['this proof writes no ManimGX'] }), leave() {} }) } as unknown as TopicRuns;

const questions = [...(args.ask ?? []), ...(args.questions ? (JSON.parse(readFileSync(args.questions, 'utf8')) as string[]) : [])];
for (const question of questions) {
  questionUsd = 0;
  const startedAt = performance.now();
  const seen: Record<string, number> = {};
  let engine = 'unknown';
  const work = createLessonWork({
    router: { route: async (request, signal) => { const route = await models.router.route(request, signal); engine = route.engine; console.log(`  route ${JSON.stringify({ engine: route.engine, kind: route.kind, topic: route.topic })}`); return route; } },
    runs: noManimRuns,
    kitRuns,
    store,
    request: question,
    isCard: false,
    studentId: args.student as string,
    getNowMs: () => performance.now(),
    isOnlyForScene: true,
    onChange: (state) => { seen[state.kind] = Math.round(performance.now() - startedAt); },
  });
  console.log(`? ${question}`);
  work.desk.ask(question);
  const waitUntil = startedAt + Number(args.waitS) * 1000;
  while (['idle', 'routing', 'making'].includes(work.desk.getState().kind) && performance.now() < waitUntil) await new Promise((resolve) => setTimeout(resolve, 100));
  const state = work.desk.getState();
  const scene = state.kind === 'ready' ? state.scene : null;
  const readyMs = seen.ready ?? null;
  const row = { question, engine, end: state.kind, readyMs, wouldLand: readyMs !== null && readyMs <= KIT_ASK_LIMIT_MS, costUsd: Number(questionUsd.toFixed(4)), trace: scene?.trace ?? null, sceneId: scene?.id ?? null, topic: scene?.topic ?? null, reasons: state.kind === 'failed' ? state.reasons : [], narration: scene?.narration ?? null };
  console.log(`= ${row.end} ready=${readyMs} cost=$${row.costUsd} ${JSON.stringify(row.reasons).slice(0, 500)}`);
  appendFileSync(join(out, 'rows.jsonl'), `${JSON.stringify(row)}\n`);
  if (scene) writeFileSync(join(out, `${scene.id}.js`), scene.code);
  work.leave();
}
console.log(`spent $${spentUsd.toFixed(3)} this run, $${(previousUsd + spentUsd).toFixed(3)} on the ledger`);
process.exit(0);
