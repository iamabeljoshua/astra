import { mkdirSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { SCRATCH, launch, openPage, waitForLoadedHome } from './lib.mjs';
const [label, against] = process.argv.slice(2);
const OUT = `${SCRATCH}/shots/webkit-${label}`;
mkdirSync(OUT, { recursive: true });
const browser = await launch('webkit');
for (const [width, height] of [[1440, 900], [1366, 768], [1280, 720], [390, 844]]) {
  for (const theme of ['light', 'dark']) {
    const key = `${width}x${height}-${theme}`;
    const { context, page } = await openPage(browser, { width, height, theme });
    await waitForLoadedHome(page);
    await page.screenshot({ path: `${OUT}/${key}.png` });
    await context.close();
    if (against) {
      const a = PNG.sync.read(readFileSync(`${SCRATCH}/shots/webkit-${against}/${key}.png`));
      const b = PNG.sync.read(readFileSync(`${OUT}/${key}.png`));
      let changed = 0;
      for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) changed += 1;
      console.log('webkit', key, 'pixels changed from the old build', changed);
    }
  }
}
await browser.close();
