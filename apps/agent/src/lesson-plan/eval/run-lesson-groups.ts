import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { type Cue, type ElementId, getBeatText, getCues, getSpokenWords, type StudentWork, type Task } from '@astra/contracts';
import { readKey } from '../../keys.ts';
import { makeAnthropicJsonReader, makeAnthropicOneWordReader, makeAnthropicTutorModel } from '../../providers/anthropic.ts';
import { createTutorBrain, type TurnSummary, type TutorBeat } from '../../tutor/brain.ts';
import { createLineReaders } from '../../tutor/line-read/read-line.ts';
import { REPLY_CHECKS } from '../../tutor/eval/reply-checks.ts';
import { TUTOR_PROMPT } from '../../tutor/prompt.ts';
import { createSpendLedger } from '../../tutor/spend-ledger.ts';
import { getWorkWords } from '../../tutor/watcher/watch-rule.ts';
import { askPlanner } from '../ask-planner.ts';
import { createLessonPlanner, type LessonPlanner } from '../lesson-planner.ts';

interface LessonTurn {
  text?: string;
  work?: { way: 'write'; id: string; text: string };
  /** The student does whatever task is open, saying this if it takes words. */
  doTask?: string;
  expect?: readonly string[];
  /** The session's title must by now hold these words. */
  title?: string;
  noTitle?: boolean;
  silent?: boolean;
  /** The next message comes before the plan has landed. */
  noWait?: boolean;
}

interface LessonGroup {
  name: string;
  turns: readonly LessonTurn[];
}

interface ReplyFacts {
  spoken: string;
  cues: readonly { cue: Cue; beatWords: number }[];
  tasksSoFar: readonly Task[];
  refused: readonly string[];
}

const EVAL_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '../../../../../evals/tutor-turns');
const TALKS_OF_A_PLAN = /\b(?:lesson plan|the plan|my plan|planner|my notes?|a note)\b/i;
const PROFILE = { level: 'high_school', interests: ['basketball', 'space'], goal: 'exam' };

const { values: args } = parseArgs({
  options: {
    planner: { type: 'string', default: 'real' },
    limit: { type: 'string', default: '1' },
    spend: { type: 'string', default: join(tmpdir(), 'astra-lessons-spend.jsonl') },
    only: { type: 'string' },
    out: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const getTask = ({ cue }: { cue: Cue }) => (cue.command.kind === 'task' ? cue.command : null);
const getReplyTasks = ({ cues }: ReplyFacts) => cues.map(getTask).filter((task) => task !== null);

/** Words to do, such as "reads":"words", putting things in order, or picking on a diagram, and never a line of math. */
const isWordsTask = (task: Task) => task.way === 'place' || (task.way === 'write' && task.on === undefined) || task.way === 'pick';
const isWorkingTask = (task: Task) => task.way === 'drag' || ((task.way === 'write' || task.way === 'pick') && task.on !== undefined);

const BRINGS_THE_BOARD: ReadonlySet<string> = new Set(['boardMode', 'writeMath', 'diagram', 'plot', 'task']);

// Whatever brings the board in first is logged and lands on a word, as long as a spoken word follows it.
function hasBoardMoveOnAWord({ cues }: ReplyFacts): boolean {
  const move = cues.find(({ cue }) => BRINGS_THE_BOARD.has(cue.command.kind) && !(cue.command.kind === 'boardMode' && cue.command.mode === 'teach'));
  return move !== undefined && move.cue.atWord < move.beatWords;
}

const isLiteralMove = ({ cue }: { cue: Cue }) => cue.command.kind === 'boardMode' && cue.command.mode === 'handsOn';

const LESSON_CHECKS: Record<string, (reply: ReplyFacts) => boolean> = {
  handsOnNow: (reply) => getReplyTasks(reply).length > 0,
  boardOnWord: hasBoardMoveOnAWord,
  wordsTask: (reply) => getReplyTasks(reply).some(isWordsTask),
  teachesFirst: (reply) => getReplyTasks(reply).length === 0 && reply.spoken.trim() !== '',
  noTask: (reply) => getReplyTasks(reply).length === 0,
  taskByNow: ({ tasksSoFar }) => tasksSoFar.length > 0,
  twoTasksByNow: ({ tasksSoFar }) => tasksSoFar.length > 1,
  wordsTaskByNow: ({ tasksSoFar }) => tasksSoFar.some(isWordsTask),
  workingTaskByNow: ({ tasksSoFar }) => tasksSoFar.some(isWorkingTask),
  saysFour: ({ spoken }) => /\b(?:four|4)\b/i.test(spoken),
  saysCanberra: ({ spoken }) => /canberra/i.test(spoken),
  noRefusedCommand: ({ refused }) => refused.length === 0,
  textOrChoices: (reply) => reply.cues.some(({ cue }) => cue.command.kind === 'text') || getReplyTasks(reply).some((task) => task.way === 'place'),
};

function runCheck(name: string, reply: ReplyFacts): boolean {
  const lesson = LESSON_CHECKS[name];
  if (lesson) return lesson(reply);
  const shared = REPLY_CHECKS[name];
  if (!shared) throw new Error(`Unknown check: ${name}`);
  return shared.passes(reply.spoken, reply.cues.map(({ cue }) => cue.command.kind));
}

function getTaskWork(said: string, brain: ReturnType<typeof createTutorBrain>, lineNumber: number): StudentWork | null {
  const { state, openTask } = brain.getBoard();
  const element = openTask === null ? undefined : state.elements.get(openTask);
  const task = element?.content.kind === 'task' ? element.content : null;
  if (!task || !openTask) return null;
  if (task.way === 'place') return { way: 'place', task: openTask, placed: task.answer ?? task.items.slice(0, task.slots.length) };
  if (task.way === 'pick') return { way: 'pick', task: openTask, part: task.answer?.[0] ?? said };
  if (task.way === 'drag') return { way: 'drag', task: openTask, x: 0, samples: [] };
  return { way: 'write', id: `s${lineNumber}` as ElementId, text: said, task: openTask };
}

const SOLVER_SYSTEM = 'You are a student doing the exercise your tutor just set. Answer with only your final answer as one short line, such as x = 4 or 3/8, with no words around it.';

// A scripted student cannot know the problem the tutor will pick, so a cheap model does it, and only for the problem in front of it.
async function getSolvedLine(solver: ReturnType<typeof makeAnthropicTutorModel>, tutorWords: string, brain: ReturnType<typeof createTutorBrain>): Promise<string> {
  const board = [...brain.getBoard().state.elements.values()].flatMap(({ content }) => (content.kind === 'writeMath' ? [content.tex] : []));
  let line = '';
  for await (const event of solver.stream({ system: SOLVER_SYSTEM, turns: [{ role: 'user', text: JSON.stringify({ tutor_said: tutorWords, board }) }] }, new AbortController().signal)) {
    if (event.type === 'text') line += event.text;
  }
  return line.trim().split('\n')[0] ?? '';
}

function makePlanner(titles: string[], planCosts: number[], lines: string[]) {
  const reader = makeAnthropicJsonReader({ apiKey: readKey('ANTHROPIC_API_KEY') });
  return createLessonPlanner({
    ask(request) {
      if (args.planner === 'fail') return Promise.reject(new Error('this run fails every plan'));
      return askPlanner(reader, request);
    },
    canSpend: () => true,
    charge: (usd) => planCosts.push(usd),
    onTitleChange(title) {
      titles.push(title);
      lines.push(`   title now: ${title}`);
    },
    trace(name, fields) {
      if (name === 'planAnswered') lines.push(`   plan: ${String(fields?.move)} in ${String(fields?.ms)} ms`);
      if (name === 'planFailed') lines.push('   plan failed');
    },
  });
}

interface GroupRun {
  group: LessonGroup;
  brain: ReturnType<typeof createTutorBrain>;
  planner: LessonPlanner | undefined;
  getLatest(): TurnSummary;
  solver: ReturnType<typeof makeAnthropicTutorModel>;
  failures: string[];
  lines: string[];
  titles: string[];
  planCosts: number[];
  firstTextMs: number[];
  tasksSoFar: Task[];
  tutorWords: string;
  lineNumber: number;
  repliesWithATask: number;
  repliesWithALiteralMove: number;
}

function startGroupRun(group: LessonGroup, ledger: ReturnType<typeof createSpendLedger>, model: ReturnType<typeof makeAnthropicTutorModel>, solver: ReturnType<typeof makeAnthropicTutorModel>): GroupRun {
  const lines = [`## ${group.name}`];
  const titles: string[] = [];
  const planCosts: number[] = [];
  const planner = args.planner === 'off' ? undefined : makePlanner(titles, planCosts, lines);
  let latest: TurnSummary | null = null;
  const brain = createTutorBrain({
    model,
    profile: PROFILE,
    readers: createLineReaders(makeAnthropicOneWordReader({ apiKey: readKey('ANTHROPIC_API_KEY'), onCost: (usd) => ledger.charge({ anthropicUsd: usd }) })),
    onTurnEnd(summary) {
      latest = summary;
      ledger.charge({ anthropicUsd: summary.costUsd });
    },
    getSpendLimit: () => (ledger.isOverModelLimit() ? 'sessionLimit' : null),
    ...(planner ? { lessonPlanner: planner } : {}),
  });
  return { group, brain, planner, getLatest: () => latest as unknown as TurnSummary, solver, failures: [], lines, titles, planCosts, firstTextMs: [], tasksSoFar: [], tutorWords: '', lineNumber: 100, repliesWithATask: 0, repliesWithALiteralMove: 0 };
}

async function getTurnWork(turn: LessonTurn, run: GroupRun): Promise<{ work: StudentWork | null; said: string | undefined }> {
  const openTask = run.brain.getBoard().openTask;
  if (turn.work) return { work: { ...turn.work, id: turn.work.id as ElementId, ...(openTask ? { task: openTask } : {}) }, said: undefined };
  if (!turn.doTask) return { work: null, said: undefined };
  const said = turn.doTask === '@solve' ? await getSolvedLine(run.solver, run.tutorWords, run.brain) : turn.doTask;
  const work = getTaskWork(said, run.brain, run.lineNumber);
  if (!work) run.failures.push(`${run.group.name}: doTask, but no task the runner can do is open`);
  return { work, said };
}

function readReply(turn: LessonTurn, text: string, beats: readonly TutorBeat[], run: GroupRun) {
  const summary = run.getLatest();
  if (summary.firstTextMs !== null) run.firstTextMs.push(Math.round(summary.firstTextMs));
  const cues = beats.flatMap((beat) => getCues(beat).map((cue) => ({ cue, beatWords: getSpokenWords(getBeatText(beat)).length })));
  const reply: ReplyFacts = { spoken: summary.spokenText, cues, tasksSoFar: run.tasksSoFar, refused: summary.refused };
  run.tutorWords = summary.spokenText;
  run.tasksSoFar.push(...getReplyTasks(reply));
  if (summary.refused.length > 0) run.lines.push(`   REFUSED: ${JSON.stringify(summary.refused)}`);
  if (getReplyTasks(reply).length > 0) {
    run.repliesWithATask += 1;
    if (cues.some(isLiteralMove)) run.repliesWithALiteralMove += 1;
  }
  run.lines.push(`S: ${text}`, `T (${summary.endedAs}, a${summary.attempts}, first text ${Math.round(summary.firstTextMs ?? -1)} ms): ${summary.spokenText}`);
  for (const { cue } of cues) run.lines.push(`   @${cue.atWord} ${JSON.stringify(cue.command)}`);
  if (TALKS_OF_A_PLAN.test(summary.spokenText)) run.failures.push(`${run.group.name}: talked about a plan: ${summary.spokenText.slice(0, 100)}`);
  for (const name of turn.expect ?? []) {
    if (!runCheck(name, reply)) run.failures.push(`${run.group.name}: ${name}: ${text.slice(0, 50)}: ${summary.spokenText.slice(0, 100)}`);
  }
}

function checkTitle(turn: LessonTurn, { group, titles, failures }: GroupRun) {
  if (turn.title && args.planner === 'real' && !titles.at(-1)?.toLowerCase().includes(turn.title.toLowerCase())) failures.push(`${group.name}: title holds no "${turn.title}", it is ${titles.at(-1) ?? 'unchanged'}`);
  if (turn.noTitle && titles.length > 0) failures.push(`${group.name}: a title was made from this: ${titles.at(-1)}`);
}

async function playTurn(turn: LessonTurn, run: GroupRun) {
  run.lineNumber += 1;
  const { work, said } = await getTurnWork(turn, run);
  const checked = work ? run.brain.noteWork(work)?.checked : null;
  if (work) run.lines.push(`S did: ${JSON.stringify(work)} code says ${checked?.verdict.status}${checked?.closesTask ? ', closes it' : ''}`);
  if (turn.silent) return;
  const text = work ? getWorkWords(work) : (turn.text ?? said ?? '');
  const beats: TutorBeat[] = [];
  for await (const beat of run.brain.reply({ text }, new AbortController().signal)) beats.push(beat);
  readReply(turn, text, beats, run);
  if (run.planner && !turn.noWait) await run.planner.whenSettled();
  checkTitle(turn, run);
  const step = run.planner?.getStepNote();
  if (step) run.lines.push(`   step: ${JSON.stringify(step)}`);
}

async function runGroup(group: LessonGroup, ledger: ReturnType<typeof createSpendLedger>, model: ReturnType<typeof makeAnthropicTutorModel>, solver: ReturnType<typeof makeAnthropicTutorModel>) {
  const run = startGroupRun(group, ledger, model, solver);
  for (const turn of group.turns) await playTurn(turn, run);
  await run.planner?.whenSettled();
  return { ...run, planUsd: run.planCosts.reduce((sum, usd) => sum + usd, 0) };
}

async function main() {
  const groups = (JSON.parse(readFileSync(join(EVAL_FOLDER, 'groups-lessons.json'), 'utf8')) as LessonGroup[]).filter(({ name }) => !args.only || new RegExp(args.only).test(name));
  if (args['dry-run']) {
    console.log(`Loaded ${groups.length} groups. Nothing was sent.`);
    return;
  }
  const ledger = createSpendLedger(args.spend, { limitUsd: Number(args.limit), limitCredits: Infinity });
  const model = makeAnthropicTutorModel({ apiKey: readKey('ANTHROPIC_API_KEY') });
  await model.warm(TUTOR_PROMPT.system);
  const solver = makeAnthropicTutorModel({ name: 'haiku-5-5', apiKey: readKey('ANTHROPIC_API_KEY') });
  const results = await Promise.all(groups.map((group) => runGroup(group, ledger, model, solver)));
  const transcript = results.flatMap(({ lines }) => [...lines, '']).join('\n');
  const failures = results.flatMap(({ failures: groupFailures }) => groupFailures);
  const planUsd = results.reduce((sum, { planUsd: usd }) => sum + usd, 0);
  const times = results.flatMap(({ firstTextMs }) => firstTextMs).sort((first, second) => first - second);
  const taskReplies = results.reduce((sum, { repliesWithATask }) => sum + repliesWithATask, 0);
  const literalMoves = results.reduce((sum, { repliesWithALiteralMove }) => sum + repliesWithALiteralMove, 0);
  const summary = [`planner ${args.planner}, ${groups.length} groups, ${literalMoves} of ${taskReplies} replies with a task said boardMode themselves, first text p50 ${times[Math.floor(times.length / 2)]} ms, p95 ${times[Math.floor(times.length * 0.95)]} ms, plans $${planUsd.toFixed(4)}, spend so far $${ledger.read().anthropicUsd.toFixed(4)}`, failures.length === 0 ? 'every check passed' : `FAILED ${failures.length}\n${failures.join('\n')}`].join('\n');
  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, `${transcript}\n${summary}\n`);
  }
  console.log(`${transcript}\n${summary}`);
  if (failures.length > 0) process.exitCode = 1;
}

await main();
