/// <reference lib="dom" />
import { execFileSync } from 'node:child_process';
import { createReadStream, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { REPO_ROOT } from './lab-stack.ts';

declare global {
  interface Window {
    mathLoad: { importMs: number; firstEquationMs: number; rendersMs: Record<string, number[]> } | null;
  }
}

const { values: args } = parseArgs({ options: { out: { type: 'string', default: '/tmp/m3-3-load' }, runs: { type: 'string', default: '5' } } });

const SERVER_PORT = Number(process.env.MATH_LOAD_PORT ?? 6241);
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const COMPRESSED = new Set(['.html', '.js', '.css']);
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const PHONE_CPU_RATE = 4;

function startServer(root: string) {
  return createServer((request, response) => {
    const path = join(root, (request.url ?? '/').split('?')[0] === '/' ? 'index.html' : (request.url ?? '/').split('?')[0] as string);
    const extension = extname(path);
    response.setHeader('Content-Type', TYPES[extension] ?? 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    if (COMPRESSED.has(extension)) {
      response.setHeader('Content-Encoding', 'gzip');
      response.end(gzipSync(readFileSync(path)));
      return;
    }
    createReadStream(path).pipe(response);
  }).listen(SERVER_PORT, '127.0.0.1');
}

function getMedian(values: readonly number[]): number {
  return [...values].sort((first, second) => first - second)[Math.floor(values.length / 2)] ?? 0;
}

function getSpread(values: readonly number[]): [number, number] {
  return [Math.min(...values), Math.max(...values)];
}

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-mock-keychain'] });

async function measureOnce({ isSlow }: { isSlow: boolean }) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await context.newPage();
  const files: { url: string; bytes: number }[] = [];
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.loadingFinished', ({ encodedDataLength, requestId }) => files.push({ url: requestUrls.get(requestId) ?? '', bytes: encodedDataLength }));
  const requestUrls = new Map<string, string>();
  cdp.on('Network.requestWillBeSent', ({ requestId, request }) => requestUrls.set(requestId, request.url));
  if (isSlow) {
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: PHONE_CPU_RATE });
  }
  await page.goto(`http://127.0.0.1:${SERVER_PORT}/`);
  await page.waitForFunction(() => window.mathLoad !== null, undefined, { timeout: 120_000 });
  const result = await page.evaluate(() => window.mathLoad);
  await context.close();
  return { result, files };
}

function getFileName(url: string): string {
  return url.split('/').at(-1) ?? '';
}

const outDir = join(args.out as string, 'dist');
const webRoot = join(REPO_ROOT, 'apps/web');
execFileSync('pnpm', ['--filter', '@astra/web', 'exec', 'vite', 'build', '--config', 'math-load/vite.config.ts'], { cwd: REPO_ROOT, env: { ...process.env, MATH_LOAD_OUT: outDir }, stdio: 'ignore' });
const server = startServer(outDir);
const runs = Number(args.runs);
const slow: Awaited<ReturnType<typeof measureOnce>>[] = [];
const fast: Awaited<ReturnType<typeof measureOnce>>[] = [];
for (let run = 0; run < runs; run += 1) {
  fast.push(await measureOnce({ isSlow: false }));
  slow.push(await measureOnce({ isSlow: true }));
}
const summarise = (group: typeof fast) => ({
  importMs: { median: Math.round(getMedian(group.map(({ result }) => result?.importMs ?? 0))), spread: getSpread(group.map(({ result }) => Math.round(result?.importMs ?? 0))) },
  firstEquationMs: { median: Math.round(getMedian(group.map(({ result }) => result?.firstEquationMs ?? 0))), spread: getSpread(group.map(({ result }) => Math.round(result?.firstEquationMs ?? 0))) },
});
const lastFiles = fast.at(-1)?.files ?? [];
const assetDir = join(outDir, 'assets');
const emitted = readdirSync(assetDir).map((name) => ({ name, raw: statSync(join(assetDir, name)).size, gzip: COMPRESSED.has(extname(name)) ? gzipSync(readFileSync(join(assetDir, name))).length : statSync(join(assetDir, name)).size }));
const renders = (result: typeof fast[number]['result']) => Object.fromEntries(Object.entries(result?.rendersMs ?? {}).map(([name, values]) => [name, { median: Number(getMedian(values).toFixed(2)), worst: Number(Math.max(...values).toFixed(2)) }]));
const report = {
  runs,
  fast: summarise(fast),
  slow4gCpu4x: summarise(slow),
  fetched: lastFiles.map((file) => ({ file: getFileName(file.url), bytes: file.bytes })).filter((file) => file.file !== ''),
  emitted,
  rendersOnMainThreadMs: { fast: renders(fast.at(-1)?.result ?? null), slow: renders(slow.at(-1)?.result ?? null) },
  webRoot,
};
writeFileSync(join(args.out as string, 'load.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(JSON.stringify(report, null, 1));
server.close();
await browser.close();
process.exit(0);
