import { readFileSync } from 'node:fs';
import { CLAIMS_A_DRAWING, KINDS_A_STUDENT_LOOKS_FOR } from '../beat-text-reader.ts';

interface TurnRow {
  group: string;
  text: string;
  spoken: string;
  commands: { kind: string; id?: string }[];
  refused: string[];
}


const isDrawn = (kind: string) => KINDS_A_STUDENT_LOOKS_FOR.has(kind) || kind === 'writeMath';

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
  for (const { kind } of commands) if (isDrawn(kind)) lesson.drew.set(kind, (lesson.drew.get(kind) ?? 0) + 1);
  lesson.refused.push(...refused);
  if (CLAIMS_A_DRAWING.test(spoken) && !commands.some(({ kind }) => isDrawn(kind)) && lesson.drew.size === 0) lesson.claimed.push(spoken);
}

for (const [name, { turns, drew, refused, claimed }] of lessons) {
  console.log(`${name}: ${turns} turns, drew ${[...drew].map(([kind, count]) => `${kind} ${count}`).join(', ') || 'nothing'}, refused ${refused.length}, claimed with nothing drawn ${claimed.length}`);
  for (const problem of refused) console.log(`   refused: ${problem.slice(0, 200)}`);
  for (const words of claimed) console.log(`   claimed: ${words.slice(0, 200)}`);
}
