import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { type AgentMessage, type Beat, type BrowserMessage, getBeatText, getCues, type SceneAgentMessage, type Task } from '@astra/contracts';
import { initializeLogger } from '@livekit/agents';
import { readKey } from '../../keys.ts';
import { createLiveSession } from '../../live/live-session.ts';
import { createTakePicker, type StoredTake } from '../../live/reactions.ts';
import { createVoiceLine, type VoiceOutput } from '../../live/voice-line.ts';
import { makeAnthropicJsonReader, makeAnthropicTutorModel } from '../../providers/anthropic.ts';
import { renderTone } from '../../providers/fakes.ts';
import { makeRenderedVoice } from '../../providers/rendered-voice.ts';
import { getSceneStoreRoot } from '../../scenes/scene-settings.ts';
import { createSceneStore, getSceneKey } from '../../scenes/scene-store.ts';
import { createTutorBrain, type StudentProfile, type TurnSummary } from '../../tutor/brain.ts';
import { TUTOR_PROMPT, withScenes } from '../../tutor/prompt.ts';
import { createSpendLedger } from '../../tutor/spend-ledger.ts';
import { createTutorScenes } from '../../tutor/tutor-scenes.ts';
import { askPlanner } from '../ask-planner.ts';
import { createLessonPlanner } from '../lesson-planner.ts';
import { getCardPictures, type CardMaterial } from '../card-lesson.ts';
import { matchLibrary, toShelfScene } from '../../scene-queue/library-match.ts';
import { createSceneQueue, type SceneQueue } from '../../scene-queue/scene-queue.ts';

interface LessonScript {
  name: string;
  card?: string;
  typed?: string;
}

type StudentKind = 'quiet' | 'nudging';

interface ReplyRecord {
  atSeconds: number;
  student: string;
  spoken: string;
  words: number;
  board: string[];
  tasks: string[];
  firstTextMs: number | null;
  costUsd: number;
  step: string;
}

const LESSONS: readonly LessonScript[] = [
  { name: 'rocket', card: 'How a rocket escapes Earth' },
  { name: 'derivative', card: 'What a derivative really measures' },
  { name: 'history', card: 'How bread prices fed a revolution' },
  { name: 'photosynthesis', typed: 'teach me photosynthesis' },
];

const API_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '../../../../api/src/picks');
const PROFILE = { level: 'high_school', interests: ['space', 'basketball'], goal: 'curiosity' };
const STAMP = { clockId: 'eval', browserMs: 1000, startedMsAgo: 0 };
const OWN_WORDS = /\bown words\b|\bin your words\b|\bexplain (?:it )?back\b/i;
/** Long enough that a tutor which has really stopped shows as stopped, and short enough to end a run on the old code. */
const GIVE_UP_AFTER_SILENCE_MS = 75_000;
const NUDGE_AFTER_IDLE_MS = 3000;
const NUDGE_WITH_NOTHING_OPEN_MS = 6000;
const LOOK_EVERY_MS = 250;
const LONGEST_LESSON_MS = 9 * 60_000;

const { values: args } = parseArgs({
  options: {
    replies: { type: 'string', default: '13' },
    limit: { type: 'string', default: '1.5' },
    spend: { type: 'string', default: join(tmpdir(), 'astra-whole-lessons-spend.jsonl') },
    out: { type: 'string', default: join(tmpdir(), 'astra-whole-lessons') },
    only: { type: 'string', default: '' },
    students: { type: 'string', default: 'quiet,nudging' },
    together: { type: 'string', default: '4' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

function makeOutput(): VoiceOutput {
  let queuedUntilMs = 0;
  let endPlayoutWait = () => {};
  return {
    sampleRate: 24000,
    async captureFrame(frame) {
      queuedUntilMs = Math.max(queuedUntilMs, performance.now()) + (frame.samplesPerChannel / frame.sampleRate) * 1000;
    },
    clearQueue() {
      queuedUntilMs = 0;
      endPlayoutWait();
    },
    async waitForPlayout() {
      await new Promise<void>((resolve) => {
        endPlayoutWait = resolve;
        setTimeout(resolve, Math.max(0, queuedUntilMs - performance.now()));
      });
    },
  };
}

function makeTake(id: string, use: StoredTake['use'], phrase: string): StoredTake {
  const { pcm, words } = renderTone(phrase);
  return { id, use, phrase, sampleRate: 24000, words, base64: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64') };
}

const TAKES = [makeTake('hm', 'reaction', 'Hm.'), makeTake('okay', 'reaction', 'Okay.'), makeTake('right', 'reaction', 'Right.'), makeTake('hello', 'greeting', 'Hello there.'), makeTake('prompt', 'prompt', 'Take your time.'), makeTake('lost', 'voiceLost', 'Sorry about that.')];

const describeTask = (task: Task, spoken: string): string => {
  if (task.way === 'write') return task.on !== undefined ? 'problem on the board' : OWN_WORDS.test(spoken) ? 'own words' : 'written words';
  return task.way;
};

// A harness copy of what the server's list gives a card, because a run here has no API behind it.
function readCardMaterial(title: string): CardMaterial {
  const store = createSceneStore(getSceneStoreRoot());
  const library = JSON.parse(readFileSync(join(API_FOLDER, 'library.json'), 'utf8')) as { topics: { id: string; title: string }[] };
  const deeper = JSON.parse(readFileSync(join(API_FOLDER, 'deeper-scenes.json'), 'utf8')) as { deeper: { topicId: string; titles: string[] }[] };
  const topicId = library.topics.find((topic) => topic.title === title)?.id;
  const titles = [title, ...(deeper.deeper.find((entry) => entry.topicId === topicId)?.titles ?? [])];
  return {
    title,
    ideas: titles.map((idea) => {
      const saved = store.find(getSceneKey(idea));
      const lines = saved ? [...saved.plan.opening, ...(saved.plan.more ?? [])].map(({ say }) => say) : [];
      return { title: idea, lines, hasScene: saved !== null };
    }),
  };
}

async function runLesson(script: LessonScript, student: StudentKind, ledger: ReturnType<typeof createSpendLedger>, readerKey: string) {
  const startedAtMs = performance.now();
  const seconds = () => Math.round((performance.now() - startedAtMs) / 100) / 10;
  const replies: ReplyRecord[] = [];
  const scenesShown: { atSeconds: number; topic: string }[] = [];
  const stepsSeen = new Set<string>();
  const timeline: string[] = [];
  let tutorEndedAtMs = startedAtMs;
  let isTutorOn = false;
  const turnsRunning = new Set<unknown>();
  const turnsSounding = new Set<unknown>();
  let isQuestionOpen = false;
  let lastSpokenBeats: readonly Beat[] = [];
  let longestSilentMs = 0;
  let longestSilentOpenMs = 0;
  let silenceOpenStartMs: number | null = null;
  let nudges = 0;

  const lastAskedAQuestion = (kind: unknown) => kind === 'scene' || lastSpokenBeats.at(-1)?.expectsReply === true;

  const noteSilenceOver = () => {
    if (turnsSounding.size > 0) return;
    const silence = performance.now() - tutorEndedAtMs;
    const isOpen = isQuestionOpen || brain.getBoard().openTask !== null;
    if (isOpen) longestSilentOpenMs = Math.max(longestSilentOpenMs, silence);
    else longestSilentMs = Math.max(longestSilentMs, silence);
    if (silence > 2500) timeline.push(`  [${(silence / 1000).toFixed(1)} s quiet, ${isOpen ? 'something open' : 'NOTHING OPEN'}]`);
  };

  const reader = makeAnthropicJsonReader({ apiKey: readerKey });
  let queue: SceneQueue | null = null;
  const planner = createLessonPlanner({
    ask: (request) => askPlanner(reader, request),
    canSpend: () => !ledger.isOverModelLimit(),
    charge: (usd) => ledger.charge({ anthropicUsd: usd }),
    onTitleChange: () => {},
    onLessonChange: (state, event) => queue?.onLesson(state, event),
    getPictureTopic: () => queue?.getPictureTopic() ?? null,
    trace: () => {},
  });
  const profile: StudentProfile = { ...PROFILE, cardTitle: script.card ?? null, ...(script.card ? { cardMaterial: readCardMaterial(script.card) } : {}) } as StudentProfile;
  let scenes: ReturnType<typeof createTutorScenes> | null = null;
  const brain = createTutorBrain({
    model: makeAnthropicTutorModel({ name: 'sonnet-5-5', apiKey: readerKey }),
    prompt: withScenes(TUTOR_PROMPT),
    lessonPlanner: planner,
    loadProfile: async () => {
      setTimeout(() => scenes?.noteCard(script.card ?? null), 0);
      return profile;
    },
    onAskScene: (topic) => queue?.onTutorAsk(topic),
    onStudentWords: (words) => queue?.noteStudentWords(words),
    onSafetyReply() {
      scenes?.noteSafetyReply();
      queue?.noteSafetyReply();
    },
    getSpendLimit: () => (ledger.isOverModelLimit() ? 'sessionLimit' : null),
    onTurnEnd(summary: TurnSummary) {
      ledger.charge({ anthropicUsd: summary.costUsd });
      lastSpokenBeats = summary.beats;
      queue?.noteTutorReply(summary);
      const step = planner.getStepNote();
      const stepName = step && 'step' in step ? `${step.step}: ${step.teach_first ?? step.then_exercise}` : step ? 'finished' : 'no plan';
      stepsSeen.add(stepName);
      const tasks = summary.beats.flatMap((beat) => getCues(beat).flatMap(({ command }) => (command.kind === 'task' ? [describeTask(command, summary.spokenText)] : [])));
      const board = summary.beats.flatMap((beat) => getCues(beat).map(({ command }) => `${command.kind}${'tex' in command && command.tex ? ` ${command.tex}` : ''}${'text' in command && command.text ? ` "${command.text}"` : ''}`));
      replies.push({ atSeconds: seconds(), student: summary.studentText, spoken: summary.spokenText, words: countWords(summary.spokenText), board, tasks, firstTextMs: summary.firstTextMs && Math.round(summary.firstTextMs), costUsd: summary.costUsd, step: stepName });
      timeline.push(`${seconds()} s [${stepName}] student said ${JSON.stringify(summary.studentText)}\n  TUTOR: ${summary.spokenText}${board.length > 0 ? `\n  board: ${board.join(' | ')}` : ''}${summary.refused.length > 0 ? `\n  refused: ${summary.refused.join('; ')}` : ''}`);
    },
  });
  const send = (message: AgentMessage) => void message;
  const session = createLiveSession({
    messenger: { send, sendOnBothChannels: send },
    line: createVoiceLine(makeOutput()),
    voice: makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts(),
    tutor: brain,
    takes: createTakePicker(TAKES),
    allTakes: TAKES,
    setTurnCap: () => {},
    onPause: () => scenes?.notePause(),
    onStudentTurn: () => scenes?.noteStudentTurn(),
    getOpeningScene: () => scenes?.getOpeningScene() ?? Promise.resolve(null),
    waitForPicture: async () => true,
    trace(name, fields = {}) {
      if (name === 'turnStarted') turnsRunning.add(fields.turnId);
      if (name === 'firstFrameCaptured') {
        if (turnsSounding.size === 0) noteSilenceOver();
        turnsSounding.add(fields.turnId);
      }
      if (name === 'turnFinished') {
        turnsRunning.delete(fields.turnId);
        const wasSounding = turnsSounding.delete(fields.turnId);
        if (wasSounding && turnsSounding.size === 0) tutorEndedAtMs = performance.now();
        if (fields.kind !== 'reaction' && wasSounding) isQuestionOpen = lastAskedAQuestion(fields.kind);
      }
      isTutorOn = turnsRunning.size > 0;
    },
  });
  const toPage = (message: SceneAgentMessage) => {
    if (message.type === 'loadScene') setTimeout(() => scenes?.onPage({ type: 'sceneLoaded', sceneId: message.sceneId }, 'eval-student'), 150);
  };
  scenes = createTutorScenes({
    router: { route: async () => ({ engine: 'none', kind: 'none', topic: '', model: 'none', ms: 0, costUsd: 0 }) },
    runs: { join: () => { throw new Error('This run writes no new scenes.'); } } as never,
    store: createSceneStore(getSceneStoreRoot()),
    getCardTitle: () => script.card ?? null,
    getNowMs: () => performance.now(),
    send: toPage,
    speak: session.speakScene,
    canSpeak: session.isAtPause,
    onShown({ topic, beats }) {
      brain.noteSceneTurn(({ topic, beats }));
      scenesShown.push({ atSeconds: seconds(), topic });
      timeline.push(`${seconds()} s SCENE "${topic}": ${beats.map(getBeatText).join(' ')}`);
      queue?.noteAhead(topic, 'shown');
    },
    onAhead: (request, state) => queue?.noteAhead(request, state),
    onPageReady: () => queue?.onPageReady(),
    trace: () => {},
  } as Parameters<typeof createTutorScenes>[0]);
  const shelfStore = createSceneStore(getSceneStoreRoot());
  queue = createSceneQueue({
    scenes,
    async readLibrary(plan) {
      const shelf = await shelfStore.listShared();
      const pictures = getCardPictures(plan, shelf.map(({ topic }) => topic));
      if (pictures) return pictures;
      const { matches, costUsd } = await matchLibrary(reader, plan, shelf.map(toShelfScene));
      ledger.charge({ anthropicUsd: costUsd });
      return matches;
    },
    getFacts: () => ({ writesStarted: 0, sceneUsd: 0, sceneLimitUsd: 0, leftTodayUsd: 3, isOverLimit: ledger.isOverModelLimit(), loadPerCore: 0, lastFirstTextMs: null }),
    canPlay: () => scenes?.canPlay() ?? false,
    moveToNextStep: () => planner.moveToNextStep(),
    trace: () => {},
  });
  scenes.onPage({ type: 'sceneDevice', canPlay: true }, 'eval-student');
  session.onBrowser({ type: 'audioState', isRunning: true, ...STAMP } as BrowserMessage);
  session.onBrowser({ type: 'typed', text: script.card ?? script.typed ?? '', ...(script.card ? { isOpening: true } : {}), ...STAMP } as BrowserMessage);

  const say = (text: string) => {
    noteSilenceOver();
    timeline.push(`${seconds()} s STUDENT: ${text}`);
    turnsSounding.clear();
    session.onEars({ type: 'voiceStarted' });
    session.onEars({ type: 'words', text, isFinal: false });
    session.onEars({ type: 'voiceEnded' });
    session.onEars({ type: 'words', text, isFinal: true });
    session.onEars({ type: 'turnDecided', text });
    tutorEndedAtMs = performance.now();
  };

  const target = Number(args.replies);
  let nudgedAtMs = 0;
  while (replies.length < target && performance.now() - startedAtMs < LONGEST_LESSON_MS && !ledger.isOverModelLimit()) {
    await delay(LOOK_EVERY_MS);
    if (isTutorOn) continue;
    const idleMs = performance.now() - tutorEndedAtMs;
    if (idleMs > GIVE_UP_AFTER_SILENCE_MS) break;
    if (student !== 'nudging' || performance.now() - nudgedAtMs < NUDGE_AFTER_IDLE_MS) continue;
    const isOpen = isQuestionOpen || brain.getBoard().openTask !== null;
    if (idleMs < (isOpen ? NUDGE_AFTER_IDLE_MS : NUDGE_WITH_NOTHING_OPEN_MS)) continue;
    nudges += 1;
    nudgedAtMs = performance.now();
    say(isOpen && nudges % 2 === 1 ? 'ok' : 'teach me more');
  }
  await delay(500);
  noteSilenceOver();
  await session.close();
  scenes.close();
  const tasks = replies.flatMap(({ tasks: replyTasks }) => replyTasks);
  const words = replies.map((reply) => reply.words).sort((first, second) => first - second);
  const firstText = replies.flatMap((reply) => reply.firstTextMs ?? []).sort((first, second) => first - second);
  const numbered = [...stepsSeen].filter((name) => /^\d+ of/.test(name));
  return {
    name: script.name,
    student,
    replies: replies.length,
    seconds: seconds(),
    concepts: new Set(numbered.map((name) => name.split(' ')[0])).size,
    planSteps: Number(numbered.at(-1)?.split(' of ')[1]?.split(':')[0] ?? 0),
    longestSilenceNothingOpenSeconds: Math.round(longestSilentMs / 100) / 10,
    longestSilenceWithSomethingOpenSeconds: Math.round(longestSilentOpenMs / 100) / 10,
    scenes: scenesShown.map(({ topic }) => topic),
    exercises: Object.fromEntries([...new Set(tasks)].map((kind) => [kind, tasks.filter((task) => task === kind).length])),
    wordsPerReply: { p50: words[Math.floor(words.length / 2)] ?? 0, worst: words.at(-1) ?? 0 },
    firstTextMs: { p50: firstText[Math.floor(firstText.length / 2)] ?? null, p95: firstText[Math.ceil(firstText.length * 0.95) - 1] ?? null },
    costUsd: Math.round(replies.reduce((sum, reply) => sum + reply.costUsd, 0) * 10000) / 10000,
    timeline,
  };
}

async function main() {
  initializeLogger({ pretty: false, level: 'silent' });
  const chosen = LESSONS.filter(({ name }) => !args.only || args.only.split(',').includes(name));
  const students = (args.students ?? '').split(',') as StudentKind[];
  const runs = chosen.flatMap((script) => students.map((student) => ({ script, student })));
  if (args['dry-run']) return console.log(`Loaded ${runs.length} lessons. Nothing was sent.`);
  const ledger = createSpendLedger(args.spend, { limitUsd: Number(args.limit), limitCredits: Infinity });
  const key = readKey('ANTHROPIC_API_KEY');
  mkdirSync(args.out, { recursive: true });
  const results = [];
  for (let start = 0; start < runs.length; start += Number(args.together)) {
    const finished = await Promise.all(runs.slice(start, start + Number(args.together)).map(async ({ script, student }) => {
      const result = await runLesson(script, student, ledger, key);
      writeFileSync(join(args.out, `${script.name}-${student}.txt`), `${result.timeline.join('\n')}\n`);
      const { timeline: _timeline, ...numbers } = result;
      console.log(JSON.stringify(numbers));
      return numbers;
    }));
    results.push(...finished);
  }
  writeFileSync(join(args.out, 'summary.json'), `${JSON.stringify({ results, spend: ledger.read() }, null, 1)}\n`);
  console.log(JSON.stringify(ledger.read()));
}

await main();
