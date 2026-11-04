import { readFileSync } from 'node:fs';

interface TurnRow {
  group: string;
  text: string;
  spoken: string;
  commands: { kind: string; id?: string }[];
  refused: string[];
}

const SHOWS = /\b(here'?s|here is|look at|see (?:the|this)|on the board|up there|i'?ve (?:drawn|put|written|added)|i (?:drew|put|wrote)|this (?:table|timeline|diagram|picture|drawing|graph|plot|code|painting))\b/i;
const DRAWN_THINGS = new Set(['table', 'timeline', 'code', 'image', 'drawing', 'diagram', 'plot', 'writeMath', 'text', 'simulate']);

const rows = readFileSync(process.argv[2] as string, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as TurnRow);
interface LessonTally {
  turns: number;
  drew: Map<string, number>;
  refused: string[];
  claimed: string[];
}

const lessons = new Map<string, LessonTally>();

for (const { group, spoken, commands, refused } of rows) {
  const lesson: LessonTally = lessons.get(group) ?? { turns: 0, drew: new Map(), refused: [], claimed: [] };
  lessons.set(group, lesson);
  lesson.turns += 1;
  for (const { kind } of commands) if (DRAWN_THINGS.has(kind)) lesson.drew.set(kind, (lesson.drew.get(kind) ?? 0) + 1);
  lesson.refused.push(...refused);
  if (SHOWS.test(spoken) && !commands.some(({ kind }) => DRAWN_THINGS.has(kind)) && lesson.drew.size === 0) lesson.claimed.push(spoken);
}

for (const [name, { turns, drew, refused, claimed }] of lessons) {
  console.log(`${name}: ${turns} turns, drew ${[...drew].map(([kind, count]) => `${kind} ${count}`).join(', ') || 'nothing'}, refused ${refused.length}, claimed with nothing drawn ${claimed.length}`);
  for (const problem of refused) console.log(`   refused: ${problem.slice(0, 200)}`);
  for (const words of claimed) console.log(`   claimed: ${words.slice(0, 200)}`);
}
