import { loadavg } from 'node:os';
import { parseArgs } from 'node:util';
import { readKey } from '../../keys.ts';
import { makeAnthropicTutorModel } from '../../providers/anthropic.ts';
import type { TutorTurn } from '../../providers/types.ts';
import { PROMPT_VERSIONS, type PromptVersion, type TutorPrompt } from '../prompt.ts';

const QUESTIONS = ['Why is the sky blue?', 'How do black holes form?', 'What is a logarithm?', 'Why do we have seasons?', 'Solve 2x + 3 = 11', 'What caused the French Revolution?', 'How does a vaccine work?', 'What is 47 times 52?', 'Why does a ball slow down as it goes up?', 'What is photosynthesis?', 'How do planes fly?', 'What is a derivative?'];
const NOTE = JSON.stringify({ student: { level: 'high_school', interests: ['basketball', 'space'], goal: 'exam' } });
const MEMORY_NOTE = JSON.stringify({ memory: { count: 3, notes: [{ kind: 'struggled', about: 'moving a term across the equals sign', detail: 'kept the plus when moving the 3', days_ago: 2, known_from: 'checked_on_board' }, { kind: 'cares_about', about: 'building rockets', days_ago: 5, known_from: 'their_words' }, { kind: 'showed', about: 'adding fractions', days_ago: 9, known_from: 'checked_on_board' }] } });
const PAUSE_MS = 300;
const WARM_WAIT_MS = 2500;

const { values: args } = parseArgs({ options: { a: { type: 'string', default: 'v2' }, b: { type: 'string', default: 'v3' }, pairs: { type: 'string', default: '24' } } });

const percentile = (values: readonly number[], share: number) => Math.round([...values].sort((left, right) => left - right)[Math.ceil(values.length * share) - 1] ?? 0);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Stops at the first word, because only the wait is measured, and that keeps the cost near a read of the cache.
async function getFirstTextMs(model: ReturnType<typeof makeAnthropicTutorModel>, version: PromptVersion, question: string): Promise<number | null> {
  const { system, turnNote, fitNote }: TutorPrompt = PROMPT_VERSIONS[version];
  const turns: TutorTurn[] = [{ role: 'user', text: question }, { role: 'system', text: NOTE }, { role: 'system', text: MEMORY_NOTE }, ...[turnNote, fitNote].flatMap((note) => (note ? [{ role: 'system' as const, text: JSON.stringify(note) }] : []))];
  const controller = new AbortController();
  const startedAt = performance.now();
  for await (const event of model.stream({ system, turns }, controller.signal)) {
    if (event.type === 'text') {
      controller.abort();
      return performance.now() - startedAt;
    }
  }
  return null;
}

// Pairs in turn, swapping which goes first, so load and order fall on both sides alike.
async function main() {
  const versions = [args.a, args.b] as PromptVersion[];
  const model = makeAnthropicTutorModel({ apiKey: readKey('ANTHROPIC_API_KEY') });
  await Promise.all(versions.map((version) => model.warm(PROMPT_VERSIONS[version].system)));
  await wait(WARM_WAIT_MS);
  const samples = new Map<PromptVersion, number[]>(versions.map((version) => [version, []]));
  for (let index = 0; index < Number(args.pairs); index += 1) {
    const order = index % 2 === 0 ? versions : [...versions].reverse();
    for (const version of order) {
      const ms = await getFirstTextMs(model, version, QUESTIONS[index % QUESTIONS.length] as string);
      if (ms !== null) samples.get(version)?.push(ms);
      await wait(PAUSE_MS);
    }
  }
  console.log(`loadavg ${loadavg().map((load) => load.toFixed(1)).join(' ')}`);
  for (const [version, values] of samples) console.log(`${version}: n ${values.length}, first text p50 ${percentile(values, 0.5)} ms, p95 ${percentile(values, 0.95)} ms`);
}

await main();
