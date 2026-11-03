import { readFileSync } from 'node:fs';
const [before, after] = process.argv.slice(2).map((path) => JSON.parse(readFileSync(path, 'utf8')));
console.log('drawings', before.length, after.length, 'identical', JSON.stringify(before) === JSON.stringify(after));
