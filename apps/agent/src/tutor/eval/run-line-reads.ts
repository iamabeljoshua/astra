import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readKey } from '../../keys.ts';
import { promisesToWait } from '../../lesson-plan/lesson-rules.ts';
import { getPlainWish } from '../../lesson-plan/student-wish.ts';
import { makeAnthropicOneWordReader, makeAnthropicTutorModel } from '../../providers/anthropic.ts';
import { makeAnthropicSafetyCheck } from '../../safety/safety-check.ts';
import { createSafetyWatch } from '../../safety/safety-watch.ts';
import { isSafetyKind } from '../../safety/student-reading.ts';
import { createSpendLedger } from '../spend-ledger.ts';
import { TUTOR_PROMPT } from '../prompt.ts';
import { MAY_BE_ABOUT_SAFETY } from '../safety-words.ts';
import { LINE_READ_RULES, type PromiseRead, TUTOR_PROMISE_RULES, toLineRead, toLineReadMessage, toPromiseRead } from '../line-read/read-line.ts';

interface Line {
  id: string;
  group: string;
  label: string;
  text: string;
  tutorSaid: string;
  isTutorWaiting?: boolean;
  isTaskOpen?: boolean;
  danger: boolean;
}

const EVAL_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '../../../../../evals/tutor-turns');
const { values: args } = parseArgs({ options: { reps: { type: 'string', default: '2' }, workers: { type: 'string', default: '6' }, spend: { type: 'string' }, out: { type: 'string' }, 'with-tutor': { type: 'boolean', default: false }, file: { type: 'string', default: 'student-lines.json' } } });
const HOLDS = new Set(['stop', 'wait', 'worrying', 'leave', 'lost']);
const lines = JSON.parse(readFileSync(join(EVAL_FOLDER, args.file), 'utf8')) as Line[];
const promises = JSON.parse(readFileSync(join(EVAL_FOLDER, 'tutor-promises.json'), 'utf8')) as { text: string; promises: boolean }[];
const ledger = args.spend ? createSpendLedger(args.spend, { limitUsd: 6, limitCredits: 0 }) : null;
let readUsd = 0;
let safetyUsd = 0;
let tutorUsd = 0;
const readWord = makeAnthropicOneWordReader({ apiKey: readKey('ANTHROPIC_API_KEY'), onCost: (usd) => (readUsd += usd) });
const safety = makeAnthropicSafetyCheck({ apiKey: readKey('ANTHROPIC_API_KEY'), onCost: (usd) => (safetyUsd += usd) });
const tagModel = makeAnthropicTutorModel({ name: 'sonnet-5-5', apiKey: readKey('ANTHROPIC_API_KEY') });
const SONNET_FIELD = '\n\nBefore anything else in every reply, write one tag in square brackets saying what the student\'s last line asks of you: [stop] if they ask you to stop, wait, or give them a moment, [leave] if they are going, [lost] if they do not understand, [go_on] if they ask you to carry on, [slower], [faster], [filler] for a nod or a stray word, [talk] for anything else.';

const getPercentile = (values: number[], fraction: number) => [...values].sort((first, second) => first - second)[Math.floor(values.length * fraction)] ?? 0;
const inParallel = async <T>(items: T[], work: (item: T) => Promise<void>) => {
  const queue = [...items];
  await Promise.all(Array.from({ length: Number(args.workers) }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) await work(item);
  }));
};

const getIsHold = (label: string) => HOLDS.has(label) || label === 'hold';
const isRight = (read: string, label: string, isTutorWaiting = false) => (getIsHold(label) ? getIsHold(read) : read === label || (isTutorWaiting && label === 'go_on' && read === 'talk'));

interface Row { line: Line; read: string; ms: number; rep: number }
const haikuRows: Row[] = [];
await inParallel(lines.flatMap((line) => Array.from({ length: Number(args.reps) }, (_, rep) => ({ line, rep }))), async ({ line, rep }) => {
  const startedAt = performance.now();
  const answer = await readWord(LINE_READ_RULES, toLineReadMessage(line.text, line));
  haikuRows.push({ line, rep, ms: performance.now() - startedAt, read: toLineRead(answer) });
});
const safetyRows: { line: Line; read: string; ms: number }[] = [];
const makeWatchInSchoolTalk = async () => {
  const watch = createSafetyWatch({ check: safety, addFlag: async () => {}, showHelp: () => {}, trace: () => {} });
  await watch.readStudent("I'd like to learn about rockets", '');
  return watch;
};
await inParallel(lines, async (line) => {
  const watch = await makeWatchInSchoolTalk();
  const startedAt = performance.now();
  const read = await watch.readStudent(line.text, line.tutorSaid);
  safetyRows.push({ line, read, ms: performance.now() - startedAt });
});
const promiseRows: { row: (typeof promises)[number]; read: PromiseRead; ms: number }[] = [];
await inParallel(promises, async (row) => {
  const startedAt = performance.now();
  promiseRows.push({ row, read: toPromiseRead(await readWord(TUTOR_PROMISE_RULES, row.text)), ms: performance.now() - startedAt });
});
const tutorRows: Row[] = [];
const readTag = async (line: Line) => {
  const controller = new AbortController();
  const turns = [...(line.tutorSaid ? [{ role: 'user' as const, text: 'teach me about rockets' }, { role: 'assistant' as const, text: line.tutorSaid }] : []), { role: 'user' as const, text: line.text }];
  let text = '';
  for await (const event of tagModel.stream({ system: TUTOR_PROMPT.system + SONNET_FIELD, turns }, controller.signal)) {
    if (event.type === 'started') tutorUsd += tagModel.getCostUsd(event.usage);
    if (event.type === 'text') text += event.text;
    if (text.includes(']')) {
      controller.abort();
      break;
    }
  }
  return /\[(\w+)\]/.exec(text)?.[1] ?? 'none';
};
if (args['with-tutor']) {
  await tagModel.warm(TUTOR_PROMPT.system + SONNET_FIELD);
  await inParallel(lines, async (line) => {
    const startedAt = performance.now();
    const read = await readTag(line).catch(() => 'failed');
    tutorRows.push({ line, rep: 0, ms: performance.now() - startedAt, read });
  });
}

const score = (name: string, rows: { line: Line; read: string }[]) => {
  const stops = rows.filter(({ line }) => getIsHold(line.label));
  const others = rows.filter(({ line }) => !getIsHold(line.label));
  const missed = stops.filter(({ read }) => !getIsHold(read));
  const falseStops = others.filter(({ read }) => getIsHold(read));
  const goOns = rows.filter(({ line }) => line.label === 'go_on');
  const right = rows.filter(({ line, read }) => isRight(read, line.label, line.isTutorWaiting));
  const byLanguage = ['igbo', 'yoruba', 'hausa', 'pidgin', 'spanish', 'french'].map((group) => {
    const inGroup = rows.filter(({ line }) => line.group === group);
    return `${group} ${inGroup.filter(({ line, read }) => isRight(read, line.label, line.isTutorWaiting)).length}/${inGroup.length}`;
  });
  console.log(`\n${name}: right ${right.length} of ${rows.length}; holds missed ${missed.length} of ${stops.length}; false holds ${falseStops.length} of ${others.length}; go on read ${goOns.filter(({ read }) => read === 'go_on').length} of ${goOns.length}`);
  console.log(`  ${byLanguage.join(', ')}`);
  for (const { line, read } of [...missed, ...falseStops]) console.log(`  ${getIsHold(line.label) ? 'MISS' : 'FALSE'} [${line.group}] ${JSON.stringify(line.text)} read ${read}`);
  const others2 = rows.filter(({ line, read }) => !isRight(read, line.label, line.isTutorWaiting) && !missed.some((row) => row.line === line) && !falseStops.some((row) => row.line === line));
  for (const { line, read } of others2) console.log(`  OTHER [${line.group}] ${JSON.stringify(line.text)} label ${line.label} read ${read}`);
};

const listRows = lines.flatMap((line) => {
  const read = getPlainWish(line.text);
  return read ? [{ line, read }] : [];
});
score(`code's whole lines, on the ${listRows.length} of ${lines.length} lines it answers`, listRows);
score('Haiku read, all reps', haikuRows);
if (tutorRows.length > 0) score('tag on the tutor\'s own reply, Sonnet', tutorRows);

const wobble = lines.filter((line) => new Set(haikuRows.filter((row) => row.line === line).map(({ read }) => read)).size > 1);
const readMs = haikuRows.map(({ ms }) => ms);
console.log(`\nHaiku read: p50 ${Math.round(getPercentile(readMs, 0.5))} ms, p95 ${Math.round(getPercentile(readMs, 0.95))} ms, max ${Math.round(Math.max(...readMs))} ms, $${(readUsd / (haikuRows.length + promiseRows.length)).toFixed(6)} a read, ${wobble.length} of ${lines.length} lines read differently across reps`);
if (tutorRows.length > 0) console.log(`Tag on Sonnet: p50 ${Math.round(getPercentile(tutorRows.map(({ ms }) => ms), 0.5))} ms, p95 ${Math.round(getPercentile(tutorRows.map(({ ms }) => ms), 0.95))} ms to the tag, $${(tutorUsd / tutorRows.length).toFixed(5)} a call with the prompt cached`);

const isDangerRead = (read: string) => isSafetyKind(read) || read === 'vague';
const dangerLines = lines.filter(({ danger }) => danger);
const calm = lines.filter(({ danger }) => !danger);
const listFalse = calm.filter(({ text }) => MAY_BE_ABOUT_SAFETY.test(text));
const listMissed = dangerLines.filter(({ text }) => !MAY_BE_ABOUT_SAFETY.test(text));
const readFalse = safetyRows.filter(({ line, read }) => !line.danger && isDangerRead(read));
const readMissed = safetyRows.filter(({ line, read }) => line.danger && !isDangerRead(read));
console.log(`\nDanger word list: caught ${dangerLines.length - listMissed.length} of ${dangerLines.length}, false ${listFalse.length} of ${calm.length}`);
for (const { text } of listMissed) console.log(`  MISS ${JSON.stringify(text)}`);
for (const { text } of listFalse) console.log(`  FALSE ${JSON.stringify(text)}`);
console.log(`Safety check: caught ${dangerLines.length - readMissed.length} of ${dangerLines.length}, false ${readFalse.length} of ${calm.length}, p50 ${Math.round(getPercentile(safetyRows.map(({ ms }) => ms), 0.5))} ms, p95 ${Math.round(getPercentile(safetyRows.map(({ ms }) => ms), 0.95))} ms`);
for (const { line, read } of readMissed) console.log(`  MISS ${JSON.stringify(line.text)} read ${read}`);
for (const { line, read } of readFalse) console.log(`  FALSE ${JSON.stringify(line.text)} read ${read}`);

const listPromises = promises.filter((row) => promisesToWait(row.text) !== row.promises);
const readPromises = promiseRows.filter(({ row, read }) => (read === 'continues') === row.promises || read === 'unread');
console.log(`\nTutor promises: word list wrong on ${listPromises.length} of ${promises.length}, Haiku wrong on ${readPromises.length} of ${promises.length}, p50 ${Math.round(getPercentile(promiseRows.map(({ ms }) => ms), 0.5))} ms`);
for (const { text, promises: says } of listPromises) console.log(`  LIST ${says ? 'MISS' : 'FALSE'} ${JSON.stringify(text)}`);
for (const { row, read } of readPromises) console.log(`  READ ${row.promises ? 'MISS' : 'FALSE'} ${JSON.stringify(row.text)} read ${read}`);

const spent = readUsd + safetyUsd + tutorUsd;
ledger?.charge({ anthropicUsd: spent, voiceCharacters: 0 });
console.log(`\nSpent $${spent.toFixed(4)}: read $${readUsd.toFixed(4)}, safety $${safetyUsd.toFixed(4)}, tutor tag $${tutorUsd.toFixed(4)}`);
if (args.out) writeFileSync(args.out, JSON.stringify({ haikuRows, safetyRows, tutorRows, promiseRows, listRows }, null, 1));
