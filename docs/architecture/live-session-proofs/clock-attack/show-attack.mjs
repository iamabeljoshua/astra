import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOWN = ['chosen', 'countOnly', 'closeLate150', 'closeLate300', 'dropOpen', 'dropClose', 'dropBoth', 'lossyOnly', 'reliableOnly', 'dup'];
const dir = process.argv[2];
const output = process.argv[3];
const scenarios = {};
for (const file of readdirSync(dir).filter((name) => name.endsWith('.json') && !name.startsWith('analysis'))) {
  const analysis = JSON.parse(execFileSync(process.execPath, [join(HERE, 'analyse-clock.mjs'), join(dir, file)], { encoding: 'utf8', maxBuffer: 1e8 }));
  const methods = Object.fromEntries(SHOWN.filter((name) => analysis.methods[name]).map((name) => [name, { ...analysis.methods[name].all, unfired: analysis.methods[name].unfired, heard: analysis.methods[name].heard }]));
  scenarios[analysis.scenario] = { load: analysis.load, wordsSent: analysis.wordsSent, wordsHeard: analysis.wordsHeard, reports: { opens: analysis.reports.opens, closes: analysis.reports.closes, opensWithNoClose: analysis.reports.opensWithNoClose.length, closeMs: analysis.reports.closeMs }, methods };
  console.log(analysis.scenario, 'load', analysis.load);
  for (const [name, row] of Object.entries(methods)) console.log(`  ${name.padEnd(13)} p95 ${String(row.p95abs).padStart(5)} worst ${String(row.maxAbs).padStart(5)} early>40 ${String(row.early40).padStart(3)} late>100 ${String(row.late100).padStart(3)} unfired ${row.unfired}/${row.heard}`);
}
if (output) writeFileSync(output, `${JSON.stringify(scenarios, null, 1)}\n`);
