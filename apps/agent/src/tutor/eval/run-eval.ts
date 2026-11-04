import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { getCues, parseBeat } from '@astra/contracts';
import { readKey } from '../../lab/keys.ts';
import { makeAnthropicTutorModel, TUTOR_MODEL_NAMES, type TutorModelName } from '../../providers/anthropic.ts';
import { createTutorBrain, type TurnSummary } from '../brain.ts';
import { TUTOR_SYSTEM } from '../prompt.ts';
import { createSpendLedger } from '../spend-ledger.ts';
import { REPLY_CHECKS } from './reply-checks.ts';

interface EvalTurn {
  text: string;
  check?: string;
}

const EVAL_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '../../../../../evals/tutor-turns');
const PROFILE = { level: 'secondary', interests: ['basketball', 'space'], goal: 'exam' };
const TURNS_PER_MINUTE = 3;
/** The rest of a session minute at listed prices, from `docs/architecture/live-session.md`: ElevenLabs at $40 per million characters, Muse at $3 per 1,000 minutes, LiveKit at about $0.01. */
const VOICE_USD_PER_CHARACTER = 40 / 1_000_000;
const OTHER_USD_PER_MINUTE = 0.003 + 0.01;
const SPOKEN_MATH_MARK = /[=+^\\$*]|\d\s*[-/x]\s*\d/;
const INTERNAL_TAG = /<\/?[a-zA-Z_][^>]*>/;

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    turns: { type: 'string', default: '30' },
    model: { type: 'string', default: 'sonnet-5-5' },
    out: { type: 'string', default: join(EVAL_FOLDER, 'results') },
    limit: { type: 'string', default: '8' },
    spend: { type: 'string', default: join(tmpdir(), 'astra-eval-spend.json') },
    compactAt: { type: 'string', default: '60000' },
    label: { type: 'string', default: '' },
  },
});

function loadTurns(count: string): EvalTurn[] {
  const turns = JSON.parse(readFileSync(join(EVAL_FOLDER, `turns-${count}.json`), 'utf8')) as EvalTurn[];
  if (turns.length !== Number(count)) throw new Error(`turns-${count}.json holds ${turns.length} turns`);
  const unknown = turns.filter((turn) => turn.check && !REPLY_CHECKS[turn.check]);
  if (unknown.length > 0) throw new Error(`Unknown checks: ${unknown.map((turn) => turn.check).join(', ')}`);
  return turns;
}

const percentile = (values: readonly number[], share: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? null : Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * share) - 1)] as number);
};

function reviewTurn(turn: EvalTurn, summary: TurnSummary) {
  const commands = summary.beats.flatMap((beat) => getCues(beat).map((cue) => cue.command.kind));
  const check = turn.check ? REPLY_CHECKS[turn.check] : undefined;
  const words = summary.spokenText.split(/\s+/).filter(Boolean).length;
  return {
    student: turn.text,
    tutor: summary.spokenText,
    words,
    commands,
    refused: summary.refused,
    firstTextMs: summary.firstTextMs && Math.round(summary.firstTextMs),
    firstBeatMs: summary.firstBeatMs && Math.round(summary.firstBeatMs),
    promptTokens: summary.promptTokens,
    usage: summary.usage,
    costUsd: summary.costUsd,
    endedAs: summary.endedAs,
    attempts: summary.attempts,
    refusalCategory: summary.refusalCategory,
    check: turn.check ?? null,
    checkPassed: check ? check.passes(summary.spokenText, commands) : null,
    hasSpokenMathMark: SPOKEN_MATH_MARK.test(summary.spokenText),
    hasTag: INTERNAL_TAG.test(summary.spokenText),
    isOverOneSecondWithNoDrawing: words >= 3 && commands.length === 0,
    allBeatsParse: summary.beats.every((beat) => parseBeat(beat).ok),
  };
}

type Reviewed = ReturnType<typeof reviewTurn>;

function summarise(reviewed: readonly Reviewed[], compactionUsd: number) {
  const usd = reviewed.reduce((sum, turn) => sum + turn.costUsd, compactionUsd);
  const characters = reviewed.reduce((sum, turn) => sum + turn.tutor.length, 0);
  const minutes = reviewed.length / TURNS_PER_MINUTE;
  const modelPerMinute = usd / minutes;
  const voicePerMinute = (characters * VOICE_USD_PER_CHARACTER) / minutes;
  return {
    turns: reviewed.length,
    firstTextMs: { p50: percentile(reviewed.flatMap((turn) => turn.firstTextMs ?? []), 0.5), p95: percentile(reviewed.flatMap((turn) => turn.firstTextMs ?? []), 0.95), worst: percentile(reviewed.flatMap((turn) => turn.firstTextMs ?? []), 1) },
    firstBeatMs: { p50: percentile(reviewed.flatMap((turn) => turn.firstBeatMs ?? []), 0.5), p95: percentile(reviewed.flatMap((turn) => turn.firstBeatMs ?? []), 0.95), worst: percentile(reviewed.flatMap((turn) => turn.firstBeatMs ?? []), 1) },
    wordsPerTurn: { p50: percentile(reviewed.map((turn) => turn.words), 0.5), p95: percentile(reviewed.map((turn) => turn.words), 0.95), worst: percentile(reviewed.map((turn) => turn.words), 1) },
    modelUsd: usd,
    usdPerMinute: { model: modelPerMinute, voice: voicePerMinute, other: OTHER_USD_PER_MINUTE, total: modelPerMinute + voicePerMinute + OTHER_USD_PER_MINUTE, atTurnsPerMinute: TURNS_PER_MINUTE },
    lastPromptTokens: reviewed.at(-1)?.promptTokens,
    cacheReadShare: reviewed.reduce((sum, turn) => sum + (turn.usage?.cacheReadTokens ?? 0), 0) / Math.max(1, reviewed.reduce((sum, turn) => sum + (turn.usage ? turn.usage.cacheReadTokens + turn.usage.cacheWriteTokens + turn.usage.inputTokens : 0), 0)),
    checksFailed: reviewed.filter((turn) => turn.checkPassed === false).map((turn) => `${turn.check}: ${turn.student}`),
    spokenMathMarks: reviewed.filter((turn) => turn.hasSpokenMathMark).length,
    tags: reviewed.filter((turn) => turn.hasTag).length,
    overOneSecondWithNoDrawing: reviewed.filter((turn) => turn.isOverOneSecondWithNoDrawing).length,
    refusedCommands: reviewed.reduce((sum, turn) => sum + turn.refused.length, 0),
    retriedTurns: reviewed.filter((turn) => turn.attempts > 1).length,
    refusals: reviewed.filter((turn) => turn.endedAs === 'refused').map((turn) => `${turn.refusalCategory}: ${turn.student}`),
    beatsThatDoNotParse: reviewed.filter((turn) => !turn.allBeatsParse).length,
  };
}

async function runLesson(turns: readonly EvalTurn[]) {
  const name = args.model as TutorModelName;
  const ledger = createSpendLedger(args.spend, { limitUsd: Number(args.limit), limitCredits: Infinity });
  const model = makeAnthropicTutorModel({ name, apiKey: readKey('ANTHROPIC_API_KEY') });
  const reviewed: Reviewed[] = [];
  let compactionUsd = 0;
  let latest: TurnSummary | null = null;
  const brain = createTutorBrain({
    model,
    profile: PROFILE,
    compactAtTokens: Number(args.compactAt),
    trace(name, fields) {
      if (name === 'modelFailed' || name === 'compactionFailed') console.log(name, fields);
    },
    onTurnEnd(summary) {
      latest = summary;
      ledger.charge({ anthropicUsd: summary.costUsd });
    },
    onCompacted({ costUsd, turnsBefore, turnsAfter }) {
      compactionUsd += costUsd;
      ledger.charge({ anthropicUsd: costUsd });
      console.log(`compacted ${turnsBefore} to ${turnsAfter} turns, $${costUsd.toFixed(4)}`);
    },
    isOverBudget: ledger.isOverModelLimit,
  });
  await model.warm(TUTOR_SYSTEM);
  for (const [index, turn] of turns.entries()) {
    for await (const beat of brain.reply({ text: turn.text }, new AbortController().signal)) void beat;
    const review = reviewTurn(turn, latest as unknown as TurnSummary);
    reviewed.push(review);
    console.log(`${index + 1}. ${review.firstTextMs} ms, ${review.words} words, ${review.commands.join(',') || 'no drawing'}: ${review.tutor.slice(0, 100)}`);
  }
  return { reviewed, compactionUsd, ledger: ledger.read() };
}

async function main() {
  if (!TUTOR_MODEL_NAMES.includes(args.model as TutorModelName)) throw new Error(`Unknown model ${args.model}. Choose one of ${TUTOR_MODEL_NAMES.join(', ')}`);
  const turns = loadTurns(args.turns);
  if (args['dry-run']) {
    console.log(`Loaded ${turns.length} turns for ${args.model}, with ${turns.filter((turn) => turn.check).length} checks. Nothing was sent.`);
    return;
  }
  const { reviewed, compactionUsd, ledger } = await runLesson(turns);
  const summary = summarise(reviewed, compactionUsd);
  mkdirSync(args.out, { recursive: true });
  const stem = `${args.model}-${args.turns}${args.label ? `-${args.label}` : ''}`;
  writeFileSync(join(args.out, `${stem}.json`), JSON.stringify({ summary, reviewed }, null, 1));
  console.log(JSON.stringify({ summary, ledger }, null, 1));
  if (summary.beatsThatDoNotParse > 0 || summary.tags > 0) process.exitCode = 1;
}

await main();
