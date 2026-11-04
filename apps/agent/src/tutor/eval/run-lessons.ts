import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { getBeatText, getCues, type SceneCommand } from '@astra/contracts';
import { readKey } from '../../keys.ts';
import { makeAnthropicTutorModel } from '../../providers/anthropic.ts';
import { createTutorBrain, type StudentProfile, type TurnSummary, type TutorBeat } from '../brain.ts';
import { CURRENT_PROMPT, PROMPT_VERSIONS, type PromptVersion, type TutorPrompt } from '../prompt.ts';
import { createSpendLedger } from '../spend-ledger.ts';

interface LessonScript {
  name: string;
  profile: StudentProfile;
  opening: string;
  student: string;
  turns: number;
}

interface LessonTurn {
  student: string;
  tutor: string;
  stretches: string[];
  drawn: string[];
  words: number;
  longestStretchWords: number;
  firstTextMs: number | null;
  attempts: number;
  refused: readonly string[];
}

const EVAL_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '../../../../../evals/tutor-turns');
/** Haiku plays the student, at about a hundredth of the tutor's cost a word, because the tutor is what is measured. */
const STUDENT_MODEL = 'claude-haiku-5-5';
const STUDENT_USD_PER_MILLION = { input: 0.1, output: 0.5 };
const STUDENT_MAX_TOKENS = 120;
const STUDENT_RULES = 'You are playing a student in a voice conversation with a tutor. Reply with only what the student says out loud, in one or two short casual lines of at most 20 words, in lower case, with no quotes and no stage directions. Stay exactly as limited as the description says. Never pretend to know something the description says you do not know, and never teach the tutor. When the tutor asks something you cannot answer, say so or guess badly, as the description says.';

const { values: args } = parseArgs({
  options: {
    prompt: { type: 'string', default: CURRENT_PROMPT },
    label: { type: 'string', default: 'run' },
    only: { type: 'string', default: '' },
    limit: { type: 'string', default: '2' },
    spend: { type: 'string', default: join(tmpdir(), 'astra-lessons-spend.jsonl') },
    together: { type: 'string', default: '2' },
    out: { type: 'string', default: join(EVAL_FOLDER, 'lessons') },
    thinking: { type: 'string', default: '' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

function getStretches(beats: readonly TutorBeat[]): string[] {
  const stretches: string[][] = [];
  for (const beat of beats) {
    if (beat.pauseBeforeMs !== undefined || stretches.length === 0) stretches.push([]);
    stretches.at(-1)?.push(getBeatText(beat).trim());
  }
  return stretches.map((stretch) => stretch.join(' '));
}

function describeCommand(command: SceneCommand): string {
  const parts: string[] = [command.kind];
  if ('tex' in command && command.tex) parts.push(command.tex);
  if ('text' in command && command.text) parts.push(command.text);
  if ('label' in command && command.label) parts.push(command.label);
  return parts.join(' ');
}

const percentile = (values: readonly number[], share: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? null : Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * share) - 1)] as number);
};

function getStudentMessages(script: LessonScript, turns: readonly LessonTurn[]): Anthropic.MessageParam[] {
  const history: Anthropic.MessageParam[] = [{ role: 'user', content: `The tutor is ready. You have just said: ${script.opening}` }];
  for (const [index, turn] of turns.entries()) {
    if (index > 0) history.push({ role: 'assistant', content: turn.student });
    const board = turn.drawn.length > 0 ? ` [On the board: ${turn.drawn.join('; ')}]` : '';
    history.push({ role: 'user', content: `Tutor says: ${turn.tutor}${board}` });
  }
  return history;
}

async function runLesson(script: LessonScript, prompt: TutorPrompt, ledger: ReturnType<typeof createSpendLedger>, studentClient: Anthropic) {
  const model = makeAnthropicTutorModel({ apiKey: readKey('ANTHROPIC_API_KEY'), ...(args.thinking === 'adaptive' ? { thinking: 'adaptive' as const } : {}) });
  let latest: TurnSummary | null = null;
  const brain = createTutorBrain({
    model,
    prompt,
    profile: script.profile,
    onTurnEnd(summary) {
      latest = summary;
      ledger.charge({ anthropicUsd: summary.costUsd });
    },
    getSpendLimit: () => (ledger.isOverModelLimit() ? 'sessionLimit' : null),
  });
  const turns: LessonTurn[] = [];
  let studentText = script.opening;
  for (let index = 0; index < script.turns; index += 1) {
    for await (const beat of brain.reply({ text: studentText }, new AbortController().signal)) void beat;
    const summary = latest as unknown as TurnSummary;
    const stretches = getStretches(summary.beats);
    turns.push({
      student: studentText,
      tutor: summary.spokenText,
      stretches,
      drawn: summary.beats.flatMap((beat) => getCues(beat).map((cue) => describeCommand(cue.command))),
      words: countWords(summary.spokenText),
      longestStretchWords: Math.max(0, ...stretches.map(countWords)),
      firstTextMs: summary.firstTextMs && Math.round(summary.firstTextMs),
      attempts: summary.attempts,
      refused: summary.refused,
    });
    if (index === script.turns - 1) break;
    const reply = await studentClient.messages.create({ model: STUDENT_MODEL, max_tokens: STUDENT_MAX_TOKENS, system: `${STUDENT_RULES}\n\n${script.student}`, messages: getStudentMessages(script, turns) });
    ledger.charge({ anthropicUsd: (reply.usage.input_tokens * STUDENT_USD_PER_MILLION.input + reply.usage.output_tokens * STUDENT_USD_PER_MILLION.output) / 1_000_000 });
    studentText = reply.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join(' ').trim() || 'i dont know';
  }
  return turns;
}

function writeTranscript(script: LessonScript, turns: readonly LessonTurn[], folder: string, version: string) {
  const lines = [`# ${script.name}`, '', `Prompt ${version}. Level ${script.profile.level}, interests ${script.profile.interests.join(', ')}, goal ${script.profile.goal}.`, '', `Student played by a cheap model: ${script.student}`, ''];
  for (const turn of turns) {
    lines.push(`**Student:** ${turn.student}`, '');
    lines.push(`**Tutor** (${turn.words} words, longest stretch ${turn.longestStretchWords}, first text ${turn.firstTextMs} ms):`);
    for (const stretch of turn.stretches) lines.push(`> ${stretch}`, '>');
    lines.pop();
    if (turn.drawn.length > 0) lines.push('', `Board: ${turn.drawn.map((item) => `\`${item}\``).join(', ')}`);
    if (turn.refused.length > 0) lines.push('', `Refused by code: ${turn.refused.join('; ')}`);
    lines.push('');
  }
  writeFileSync(join(folder, `${script.name}.md`), lines.join('\n'));
}

function summarise(lessons: readonly (readonly LessonTurn[])[]) {
  const turns = lessons.flat();
  return {
    turns: turns.length,
    firstTextMs: { p50: percentile(turns.flatMap((turn) => turn.firstTextMs ?? []), 0.5), p95: percentile(turns.flatMap((turn) => turn.firstTextMs ?? []), 0.95) },
    wordsPerReply: { p50: percentile(turns.map((turn) => turn.words), 0.5), p95: percentile(turns.map((turn) => turn.words), 0.95), worst: percentile(turns.map((turn) => turn.words), 1) },
    longestStretch: { p50: percentile(turns.map((turn) => turn.longestStretchWords), 0.5), p95: percentile(turns.map((turn) => turn.longestStretchWords), 0.95), worst: percentile(turns.map((turn) => turn.longestStretchWords), 1) },
    repliesEndingOnAQuestion: turns.filter((turn) => /\?\s*$/.test(turn.tutor)).length,
    repliesOverTwentyFiveWords: turns.filter((turn) => turn.words > 25).length,
    repliesOverFortyFiveWords: turns.filter((turn) => turn.words > 45).length,
  };
}

async function runInGroups<Input, Output>(items: readonly Input[], size: number, work: (item: Input) => Promise<Output>): Promise<Output[]> {
  const results: Output[] = [];
  for (let start = 0; start < items.length; start += size) results.push(...(await Promise.all(items.slice(start, start + size).map(work))));
  return results;
}

async function main() {
  const version = args.prompt as PromptVersion;
  const prompt = PROMPT_VERSIONS[version];
  if (!prompt) throw new Error(`Unknown prompt ${args.prompt}. Choose ${Object.keys(PROMPT_VERSIONS).join(', ')}`);
  const all = JSON.parse(readFileSync(join(EVAL_FOLDER, 'lessons.json'), 'utf8')) as LessonScript[];
  const chosen = args.only ? all.filter((script) => args.only?.split(',').includes(script.name)) : all;
  if (args['dry-run']) {
    console.log(`Loaded ${chosen.length} lessons on prompt ${version}. Nothing was sent.`);
    return;
  }
  const ledger = createSpendLedger(args.spend, { limitUsd: Number(args.limit), limitCredits: Infinity });
  const studentClient = new Anthropic({ apiKey: readKey('ANTHROPIC_API_KEY'), maxRetries: 2 });
  const folder = join(args.out, args.label);
  mkdirSync(folder, { recursive: true });
  const lessons = await runInGroups(chosen, Number(args.together), async (script) => {
    const turns = await runLesson(script, prompt, ledger, studentClient);
    writeTranscript(script, turns, folder, version);
    console.log(`${script.name}: done, ${turns.length} turns`);
    return turns;
  });
  const summary = summarise(lessons);
  writeFileSync(join(folder, 'summary.json'), `${JSON.stringify({ prompt: version, summary, spend: ledger.read() }, null, 1)}\n`);
  console.log(JSON.stringify({ summary, spend: ledger.read() }, null, 1));
}

await main();
