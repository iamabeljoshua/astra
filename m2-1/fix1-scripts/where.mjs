import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const [a, b] = process.argv.slice(2).map((path) => PNG.sync.read(readFileSync(path)));
let box = null; const rows = {};
for (let y = 0; y < a.height; y += 1) for (let x = 0; x < a.width; x += 1) {
  const i = (a.width * y + x) << 2;
  if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) {
    box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y];
    rows[y] = (rows[y] ?? 0) + 1;
    if (Object.values(rows).reduce((s, v) => s + v, 0) <= 6) console.log('sample', x, y, [...a.data.subarray(i, i + 3)], [...b.data.subarray(i, i + 3)]);
  }
}
console.log(a.width, a.height, 'bbox', box, JSON.stringify(rows));
