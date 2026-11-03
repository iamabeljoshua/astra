import { chromium } from '/Users/abel/startup/astra-worktrees/m2-7/node_modules/playwright/index.mjs';
const [, , evidenceDir, outputPath] = process.argv;
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:32px;background:#fff;color:#111;font:20px/1.4 -apple-system,Helvetica,Arial,sans-serif;width:2000px}
h1{font-size:26px;margin:0 0 20px;font-weight:600}
.row{display:grid;grid-template-columns:1fr 1fr;gap:24px}
h2{font-size:21px;margin:0 0 4px;font-weight:600}
p{margin:0 0 12px;color:#333}
img{width:100%;border:1px solid #999;display:block}
</style>
<h1>M2.7 at 253e193, through a proxy in front of the running app, laptop width</h1>
<div class="row">
<div><h2>Hung API</h2><p>Failure line 30.006 s after the request started. One request. The browser closed it at 30.004 s.</p><img src="file://${evidenceDir}/m2-7-hung-and-slow-laptop-hung-failure-line.png"></div>
<div><h2>API that answers after 5 seconds</h2><p>Cards 5.031 s after the request started. One request. No failure line at any point.</p><img src="file://${evidenceDir}/m2-7-hung-and-slow-laptop-slow-result.png"></div>
</div>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2064, height: 400 } });
const htmlPath = `${outputPath}.html`;
const { writeFileSync, rmSync } = await import('node:fs');
writeFileSync(htmlPath, html);
await page.goto(`file://${htmlPath}`);
await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
await page.screenshot({ path: outputPath, fullPage: true });
await browser.close();
rmSync(htmlPath);
