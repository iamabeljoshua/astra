import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkStep, getLineTex, readLine } from '@astra/board/shared';
import type { ElementId, Task } from '@astra/contracts';
import { readKey } from '../../keys.ts';
import { makeAnthropicTutorModel } from '../../providers/anthropic.ts';
import { createSpendLedger } from '../spend-ledger.ts';
import { readSpoken } from '../watcher/read-spoken.ts';
import { decideSpoken } from '../watcher/spoken-answer.ts';

interface SpokenRow {
  problem: string;
  said: string;
  truth: 'right' | 'wrong' | 'talk';
  voice: string;
  /** What Muse really wrote for this clip. */
  final: string;
}

const EVAL_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '../../../../../evals/tutor-turns');
const TASK: Task = { kind: 'task', id: 'a1' as ElementId, way: 'write', on: 'eq' as ElementId };

const { values: args } = parseArgs({ options: { limit: { type: 'string', default: '0.3' }, spend: { type: 'string', default: '/tmp/astra-spoken-spend.jsonl' } } });

async function main() {
  const rows = JSON.parse(readFileSync(join(EVAL_FOLDER, 'spoken-lines.json'), 'utf8')) as SpokenRow[];
  const model = makeAnthropicTutorModel({ name: 'haiku-5-5', apiKey: readKey('ANTHROPIC_API_KEY') });
  const ledger = createSpendLedger(args.spend, { limitUsd: Number(args.limit), limitCredits: Infinity });
  const tally = { rows: 0, wrongRows: 0, wrongCalledWrong: 0, wrongUnknownOrUnsure: 0, wrongNoLine: 0, wrongReadAsRight: 0, rightRows: 0, rightReadRight: 0, rightUnknownOrUnsure: 0, rightNoLine: 0, rightCalledWrong: 0, talkRows: 0, talkStayedTalk: 0, talkLanded: 0, askedTheReader: 0, usd: 0 };
  for (const row of rows) {
    if (ledger.isOverModelLimit()) break;
    const problemTex = getLineTex(readLine(row.problem));
    const decision = decideSpoken(row.final, TASK, []);
    let tex = decision.act === 'line' ? decision.tex : null;
    let isUnsure = false;
    if (decision.act === 'askModel') {
      tally.askedTheReader += 1;
      const read = await readSpoken(model, row.final, decision.expects);
      tally.usd += read.costUsd;
      ledger.charge({ anthropicUsd: read.costUsd });
      if (read.kind === 'line') {
        tex = read.heard.tex ?? null;
        isUnsure = read.heard.isUnsure;
      }
    }
    const status = tex === null ? 'noLine' : isUnsure ? 'unknown' : checkStep({ tex, problemTex, previousTex: null }).status;
    tally.rows += 1;
    if (row.truth === 'wrong') {
      tally.wrongRows += 1;
      if (status === 'right') {
        tally.wrongReadAsRight += 1;
        console.log('WRONG READ AS RIGHT', row.said, '| heard', row.final, '| read', tex);
      } else if (status === 'wrong') tally.wrongCalledWrong += 1;
      else if (status === 'unknown') tally.wrongUnknownOrUnsure += 1;
      else {
        tally.wrongNoLine += 1;
        console.log('no line', row.said, '| heard', row.final);
      }
    } else if (row.truth === 'right') {
      tally.rightRows += 1;
      if (status === 'right') tally.rightReadRight += 1;
      else if (status === 'wrong') {
        tally.rightCalledWrong += 1;
        console.log('RIGHT CALLED WRONG', row.said, '| heard', row.final, '| read', tex);
      } else if (status === 'unknown') tally.rightUnknownOrUnsure += 1;
      else {
        tally.rightNoLine += 1;
        console.log('no line', row.said, '| heard', row.final);
      }
    } else {
      tally.talkRows += 1;
      if (tex === null) tally.talkStayedTalk += 1;
      else {
        tally.talkLanded += 1;
        console.log('TALK LANDED', row.said, '| heard', row.final, '| read', tex);
      }
    }
  }
  console.log(JSON.stringify({ ...tally, usd: Number(tally.usd.toFixed(4)) }));
  if (tally.wrongReadAsRight > 0 || tally.rightCalledWrong > 0 || tally.talkLanded > 0) process.exitCode = 1;
}

await main();
