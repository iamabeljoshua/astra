import { parseArgs } from 'node:util';
import { checkStep, getLineTex, readLine, writeByHand } from '@astra/board/shared';
import { readKey } from '../../keys.ts';
import { makeAnthropicPictureReader } from '../../providers/anthropic.ts';
import { readInk } from '../ink/read-ink.ts';
import { rasterizeInk } from '../ink/rasterize-ink.ts';
import { createSpendLedger } from '../spend-ledger.ts';

/** Lines a student could write, and whether each is true of its problem. The worst failure is a false line read so that code calls it right. */
interface InkRow {
  problem: string | null;
  written: string;
  truth: 'right' | 'wrong' | 'words';
}

const LINEAR = '2x + 3 = 11';
const NEGATIVE = '-2x + 6 = 10';
const TABLE: readonly InkRow[] = [
  ...['2x = 14', 'x = 7', 'x = 8', '2x + 3 = 8', '2x = 11', 'x = 5', '2x = 9', 'x = 3', 'x = 44', '4x = 8', '2x = 18', 'x = 9', '2x = 80', 'x = 1'].map((written) => ({ problem: LINEAR, written, truth: 'wrong' as const })),
  ...['-2x = 16', 'x = 2', '-2x = 14', 'x = -8', 'x = 8', '2x = 4', 'x = -3', '-2x = 6'].map((written) => ({ problem: NEGATIVE, written, truth: 'wrong' as const })),
  ...['2x = 8', 'x = 4', '11 = 2x + 3', '2x + 3 = 11'].map((written) => ({ problem: LINEAR, written, truth: 'right' as const })),
  ...['-2x = 4', 'x = -2'].map((written) => ({ problem: NEGATIVE, written, truth: 'right' as const })),
  ...['the bastille fell in 1789', 'nucleus', 'mitochondria', 'gravity pulls it down', 'i think its the membrane', 'wich one is it', 'photosynthesis', 'napoleon came last'].map((written) => ({ problem: null, written, truth: 'words' as const })),
];

const { values: args } = parseArgs({ options: { hands: { type: 'string', default: '2' }, limit: { type: 'string', default: '0.5' }, spend: { type: 'string', default: '/tmp/astra-ink-spend.jsonl' } } });

const toStrokes = (text: string, seed: string) => {
  const drawing = writeByHand({ text, fontSize: 56, maxWidth: 1400, seed });
  if (!drawing) throw new Error(`no strokes for ${text}`);
  return drawing.strokes.map(({ points }) => points.map(({ x, y }, index) => [(x + 20) / 1400, (y + 20) / 1400, index * 8] as [number, number, number]));
};

const toKey = (text: string) => text.toLowerCase().replace(/\s/g, '');

async function main() {
  const reader = makeAnthropicPictureReader({ apiKey: readKey('ANTHROPIC_API_KEY') });
  const ledger = createSpendLedger(args.spend, { limitUsd: Number(args.limit), limitCredits: Infinity });
  const tally = { wrongRows: 0, wrongReadExact: 0, wrongStillWrong: 0, wrongUnknownOrUnsure: 0, wrongReadAsRight: 0, rightRows: 0, rightReadRight: 0, rightUnknownOrUnsure: 0, rightCalledWrong: 0, wordsRows: 0, wordsExact: 0, wordsFixedOrMisread: 0, usd: 0, msTotal: 0 };
  for (let hand = 0; hand < Number(args.hands); hand += 1) {
    for (const row of TABLE) {
      if (ledger.isOverModelLimit()) break;
      const png = rasterizeInk(toStrokes(row.written, `hand-${hand}-${row.written}`));
      const startedAt = performance.now();
      const { text, ink, costUsd } = await readInk(reader, png as Buffer);
      tally.msTotal += performance.now() - startedAt;
      tally.usd += costUsd;
      ledger.charge({ anthropicUsd: costUsd });
      const problemTex = row.problem === null ? null : getLineTex(readLine(row.problem));
      const status = ink.isUnsure || ink.tex === undefined ? 'unknown' : checkStep({ tex: ink.tex, problemTex, previousTex: null }).status;
      const isExact = toKey(text) === toKey(row.written);
      if (row.truth === 'wrong') {
        tally.wrongRows += 1;
        if (isExact) tally.wrongReadExact += 1;
        if (status === 'right') {
          tally.wrongReadAsRight += 1;
          console.log('WRONG READ AS RIGHT', row.written, '->', text);
        } else if (status === 'wrong') tally.wrongStillWrong += 1;
        else tally.wrongUnknownOrUnsure += 1;
      } else if (row.truth === 'right') {
        tally.rightRows += 1;
        if (status === 'right') tally.rightReadRight += 1;
        else if (status === 'wrong') {
          tally.rightCalledWrong += 1;
          console.log('RIGHT CALLED WRONG', row.written, '->', text);
        } else tally.rightUnknownOrUnsure += 1;
      } else {
        tally.wordsRows += 1;
        if (isExact) tally.wordsExact += 1;
        else {
          tally.wordsFixedOrMisread += 1;
          console.log('WORDS', row.written, '->', text);
        }
      }
    }
  }
  console.log(JSON.stringify({ ...tally, usd: Number(tally.usd.toFixed(4)), msPerRead: Math.round(tally.msTotal / (tally.wrongRows + tally.rightRows + tally.wordsRows)) }));
  if (tally.wrongReadAsRight > 0 || tally.rightCalledWrong > 0) process.exitCode = 1;
}

await main();
