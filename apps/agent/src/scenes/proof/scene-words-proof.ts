import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { type Beat, getBeatText, getCues } from '@astra/contracts';
import { readKey } from '../../keys.ts';
import { type JsonReader, makeAnthropicJsonReader } from '../../providers/anthropic.ts';
import { makeOpenAiJsonReader } from '../../providers/openai-json.ts';
import { getTutorSceneBeats } from '../../tutor/tutor-scenes.ts';
import { createLiveSceneWords } from '../live-words/live-scene-words.ts';
import type { StudentFacts } from '../live-words/write-speech.ts';
import { getSceneKey, createSceneStore } from '../scene-store.ts';
import type { StoredScene } from '../scene-types.ts';

// node scene-words-proof.ts --model haiku|openai --store <dir> --out <file.jsonl> [--topics 'a|b'] [--scene <scene.json>] [--limit <n>]
const SAVED_TOPICS = ['What a quadratic is really asking', 'How a rocket escapes Earth', 'Why a free kick curves', 'What really causes the seasons'];
const NOTE_WORD: Readonly<Record<string, string>> = { 'What a quadratic is really asking': 'quadratic equations', 'How a rocket escapes Earth': 'rocket speed', 'Why a free kick curves': 'free kick spin', 'What really causes the seasons': 'seasons and tilt' };

function getArgument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? null : (process.argv[index + 1] ?? null);
}

const getStudents = (scene: StoredScene, justSaid: string): Record<string, StudentFacts> => ({
  football: { level: 'high_school', interests: ['football'], notes: [], justSaid, studentSaid: 'ok go on' },
  struggled: { level: 'high_school', interests: [], notes: [{ kind: 'struggled', about: NOTE_WORD[scene.topic] ?? scene.topic }], justSaid, studentSaid: "i don't really get it" },
  nothingKnown: { level: null, interests: [], notes: [], justSaid, studentSaid: '' },
  footballFirstThing: { level: 'high_school', interests: ['football'], notes: [], justSaid: '', studentSaid: '' },
});

const getJustSaid = (scene: StoredScene) => scene.plan.opening.map(({ say }) => say).slice(0, 2).join(' ') || `So let's see ${scene.topic.toLowerCase()}.`;

const getCueOrder = (beats: readonly Beat[]) => beats.flatMap(getCues).flatMap(({ command }) => (command.kind === 'runSimulation' && command.action === 'play' && typeof command.until === 'string' ? [command.until] : []));

const getPercentile = (values: readonly number[], share: number) => [...values].sort((first, second) => first - second)[Math.min(values.length - 1, Math.floor(values.length * share))] ?? 0;

async function runOne(scene: StoredScene, student: StudentFacts, reader: JsonReader): Promise<Record<string, unknown>> {
  const fields: Record<string, unknown> = {};
  const startedAt = performance.now();
  let settle = () => {};
  const settled = new Promise<void>((resolve) => (settle = resolve));
  const words = createLiveSceneWords({ reader, getStudent: async () => student, isReplyStarting: () => false, canSpend: () => true, onCost: (usd) => (fields.costUsd = usd), onSettled: () => settle(), getNowMs: () => performance.now(), trace: (_name, traced = {}) => Object.assign(fields, traced) });
  words.startOnce(scene, scene.topic.toLowerCase());
  await settled;
  const read = words.read(scene.id);
  const beats = getTutorSceneBeats({ plan: read.kind === 'live' ? read.speech : scene.plan, scene, number: 1 });
  return { ...fields, ms: Math.round(performance.now() - startedAt), isLive: read.kind === 'live', heard: beats.map(getBeatText).join(' '), cueOrder: getCueOrder(beats) };
}

async function main() {
  const model = getArgument('model') ?? 'openai';
  const reader = model === 'openai' ? makeOpenAiJsonReader({ apiKey: readKey('OPENAI_API_KEY') }) : makeAnthropicJsonReader({ apiKey: readKey('ANTHROPIC_API_KEY') });
  const out = getArgument('out') ?? '/dev/null';
  const store = createSceneStore(getArgument('store') ?? '');
  const scenePath = getArgument('scene');
  const saved = (getArgument('topics')?.split('|') ?? SAVED_TOPICS).flatMap((topic) => {
    const found = store.find(getSceneKey(topic));
    return found ? [found] : [];
  });
  const scenes = [...saved, ...(scenePath ? [JSON.parse(readFileSync(scenePath, 'utf8')) as StoredScene] : [])].slice(0, Number(getArgument('limit') ?? 99));
  writeFileSync(out, '');
  const rows: Record<string, unknown>[] = [];
  for (const scene of scenes) {
    for (const [name, student] of Object.entries(getStudents(scene, getJustSaid(scene)))) {
      const result = await runOne(scene, student, reader);
      const row = { topic: scene.topic, student: name, model, ...result };
      rows.push(row);
      appendFileSync(out, `${JSON.stringify(row)}\n`);
    }
  }
  const live = rows.filter((row) => row.isLive).length;
  const times = rows.map((row) => row.ms as number);
  const cost = rows.reduce((sum, row) => sum + ((row.costUsd as number) ?? 0), 0);
  process.stdout.write(`${model}: ${live} of ${rows.length} live, fallback ${rows.length - live}, call p50 ${getPercentile(times, 0.5)} ms, p95 ${getPercentile(times, 0.95)} ms, worst ${Math.max(...times)} ms, $${cost.toFixed(5)}\n`);
}

await main();
