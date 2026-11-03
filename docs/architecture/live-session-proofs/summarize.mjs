import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = join(HERE, 'runs');
const RESULTS = join(HERE, 'results');
mkdirSync(RESULTS, { recursive: true });

const named = process.argv.slice(2);
const folders = named.length > 0 ? named : readdirSync(RUNS, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
for (const folder of folders) {
  const scenarios = {};
  for (const file of readdirSync(join(RUNS, folder))) {
    if (!file.endsWith('.json') || file === 'summary.json' || file.endsWith('.failed.json')) continue;
    const { summary } = JSON.parse(readFileSync(join(RUNS, folder, file), 'utf8'));
    scenarios[file.replace('.json', '')] = summary;
  }
  writeFileSync(join(RESULTS, `${folder}.json`), `${JSON.stringify(scenarios, null, 1)}\n`);
}
