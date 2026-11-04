import { readKey } from '../../keys.ts';
import { askPlanner } from '../../lesson-plan/ask-planner.ts';
import { makeAnthropicJsonReader } from '../../providers/anthropic.ts';
import { getSceneStoreRoot } from '../../scenes/scene-settings.ts';
import { createSceneStore } from '../../scenes/scene-store.ts';
import { matchLibrary, toShelfScene } from '../library-match.ts';

const ASKS = [
  "Teach me about Saturn's rings",
  'Help me understand what causes the seasons',
  'Why does the moon always look the same',
  'teach me about black holes',
  'how does a free kick curve',
  'what is a derivative',
  'help me understand compound interest',
  'teach me how logarithms work',
  'teach me why cats purr',
  'how did the French Revolution start',
  'explain photosynthesis',
  'I want to learn how sorting algorithms work',
  'solve 2x + 3 = 11',
  'teach me the causes of World War 1',
];

const reader = makeAnthropicJsonReader({ apiKey: readKey('ANTHROPIC_API_KEY') });
const shelf = (await createSceneStore(getSceneStoreRoot()).listShared()).map(toShelfScene);
console.log(`${shelf.length} shared scenes`);
let totalUsd = 0;
for (const said of ASKS) {
  const { move, costUsd: planUsd } = await askPlanner(reader, { now: null, earlier: [], said, tutorSaid: '' });
  if (move?.move !== 'new') {
    console.log(`\n${said}\n  no plan: ${move?.move ?? 'none'}`);
    continue;
  }
  const { matches, costUsd } = await matchLibrary(reader, move.plan, shelf);
  totalUsd += planUsd + costUsd;
  console.log(`\n${said} [${move.plan.topic}]`);
  move.plan.steps.forEach((step, index) => console.log(`  ${step.teach ?? step.exercise}\n    -> ${matches[index] ?? '(none)'}`));
}
console.log(`\nspent $${totalUsd.toFixed(4)}`);
