import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { type ElementId, getCues, type StudentWork } from '@astra/contracts';
import { readKey } from '../../keys.ts';
import { makeAnthropicTutorModel } from '../../providers/anthropic.ts';
import { createTutorBrain, type TurnSummary } from '../brain.ts';
import { TUTOR_SYSTEM } from '../prompt.ts';
import { createSpendLedger } from '../spend-ledger.ts';
import { getWorkWords } from '../watcher/watch-rule.ts';
import { REPLY_CHECKS } from './reply-checks.ts';

/** Work on the board. A place names how to fill the open task's slots, because the tutor chose the items. */
type GroupWork = { way: 'write'; id: string; text: string } | { way: 'leave' } | { way: 'pick'; part: string } | { way: 'place'; placed: 'rightOrder' | 'wrongOrder' };

interface GroupTurn {
  text?: string;
  work?: GroupWork;
  check?: string;
  /** Code would not call the tutor for this work, so the turn only notes it. */
  silent?: boolean;
}

function toStudentWork(work: GroupWork, brain: ReturnType<typeof createTutorBrain>): StudentWork {
  const { state, openTask } = brain.getBoard();
  const element = openTask === null ? undefined : state.elements.get(openTask);
  const task = element?.content.kind === 'task' ? element.content : null;
  if (work.way === 'write') return { way: 'write', id: work.id as ElementId, text: work.text, ...(openTask ? { task: openTask } : {}) };
  if (!openTask || !task) throw new Error('the tutor set no task');
  if (work.way === 'leave') return { way: 'leave', task: openTask };
  if (work.way === 'pick') return { way: 'pick', task: openTask, part: work.part };
  if (task.way !== 'place') throw new Error('the tutor set no place task');
  const right = task.answer ?? task.items.slice(0, task.slots.length);
  return { way: 'place', task: openTask, placed: work.placed === 'rightOrder' ? right : [...right].reverse() };
}

interface PromptGroup {
  name: string;
  /** Checked on every turn in the group. */
  checks: readonly string[];
  turns: readonly GroupTurn[];
}

const EVAL_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '../../../../../evals/tutor-turns');
const PROFILE = { level: 'high_school', interests: ['basketball', 'space'], goal: 'exam' };

const { values: args } = parseArgs({
  options: {
    file: { type: 'string', default: 'safety' },
    'dry-run': { type: 'boolean', default: false },
    limit: { type: 'string', default: '1' },
    spend: { type: 'string', default: join(tmpdir(), 'astra-groups-spend.jsonl') },
  },
});

function loadGroups(name: string): PromptGroup[] {
  const groups = JSON.parse(readFileSync(join(EVAL_FOLDER, `groups-${name}.json`), 'utf8')) as PromptGroup[];
  const names = groups.flatMap((group) => [...group.checks, ...group.turns.flatMap((turn) => turn.check ?? [])]);
  const unknown = names.filter((check) => !REPLY_CHECKS[check]);
  if (unknown.length > 0) throw new Error(`Unknown checks: ${unknown.join(', ')}`);
  return groups;
}

// Each group runs in a session of its own, because a safety message earlier in a lesson changes every reply after it.
async function runGroup(group: PromptGroup, ledger: ReturnType<typeof createSpendLedger>, model: ReturnType<typeof makeAnthropicTutorModel>): Promise<string[]> {
  const traces: string[] = [];
  const failures: string[] = [];
  let latest: TurnSummary | null = null;
  const brain = createTutorBrain({
    model,
    profile: PROFILE,
    trace: (name, fields) => traces.push(`${name}${fields?.problem ? `: ${String(fields.problem)}` : ''}`),
    onTurnEnd(summary) {
      latest = summary;
      ledger.charge({ anthropicUsd: summary.costUsd });
    },
    getSpendLimit: () => (ledger.isOverModelLimit() ? 'sessionLimit' : null),
  });
  for (const turn of group.turns) {
    traces.length = 0;
    const beats = [];
    const work = turn.work ? toStudentWork(turn.work, brain) : null;
    const checked = work ? brain.noteWork(work)?.checked : null;
    if (work) console.log(`[${group.name}] ${JSON.stringify(work)} code says ${checked?.verdict.status}${checked?.closesTask ? ', done' : ''}`);
    if (turn.silent) continue;
    const text = work ? getWorkWords(work) : (turn.text as string);
    for await (const beat of brain.reply({ text }, new AbortController().signal)) beats.push(beat);
    const summary = latest as unknown as TurnSummary;
    const commands = beats.flatMap((beat) => getCues(beat).map((cue) => cue.command));
    console.log(`[${group.name}] S: ${text}`);
    console.log(`   T(${summary.endedAs},a${summary.attempts}${summary.refusalCategory ? `,${summary.refusalCategory}` : ''}): ${summary.spokenText}`);
    for (const command of commands) console.log(`     cmd ${JSON.stringify(command)}`);
    if (traces.length > 0) console.log(`   traces: ${traces.join(' | ')}`);
    for (const check of [...group.checks, ...(turn.check ? [turn.check] : [])]) {
      if (REPLY_CHECKS[check]?.onlyOnWork && !turn.work) continue;
      if (!REPLY_CHECKS[check]?.passes(summary.spokenText, commands.map((command) => command.kind))) failures.push(`${group.name}: ${check}: ${text.slice(0, 60)}: ${summary.spokenText.slice(0, 120)}`);
    }
  }
  return failures;
}

async function main() {
  const groups = loadGroups(args.file);
  const turnCount = groups.reduce((sum, group) => sum + group.turns.length, 0);
  if (args['dry-run']) {
    console.log(`Loaded ${groups.length} groups, ${turnCount} turns. Nothing was sent.`);
    return;
  }
  const ledger = createSpendLedger(args.spend, { limitUsd: Number(args.limit), limitCredits: Infinity });
  const model = makeAnthropicTutorModel({ apiKey: readKey('ANTHROPIC_API_KEY') });
  await model.warm(TUTOR_SYSTEM);
  const failures = (await Promise.all(groups.map((group) => runGroup(group, ledger, model)))).flat();
  console.log(`\nspend so far: $${ledger.read().anthropicUsd.toFixed(4)}`);
  console.log(failures.length === 0 ? 'every check passed' : `FAILED\n${failures.join('\n')}`);
  if (failures.length > 0) process.exitCode = 1;
}

await main();
