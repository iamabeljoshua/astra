import { createServer } from 'node:http';
import { getKitCodeProblems } from '../kit-code-check.ts';
import { createFrameCheck } from '../kit-worker.ts';

const CANARY_PORT = Number(process.env.KIT_CANARY_PORT ?? 6853);
const hits: string[] = [];
const canary = createServer((request, response) => {
  hits.push(request.url ?? '');
  response.end('x');
}).listen(CANARY_PORT, '127.0.0.1');

const MOMENTS = { a: 0, b: 2 };
const BALL = "kit.stage('studio', {}); const ball = kit.mesh({ id: 'ball', shape: 'sphere', size: 1, material: 'ceramic', color: '#c9b08a' }); kit.shots([{ at: 0, move: 'cut', target: 'ball', distance: 5 }]);";
const GOOD_RENDER = "ball.scale(1 + kit.p(t, 'b'));";
const scene = (build: string, render = GOOD_RENDER) => `function scene(kit) { ${BALL} ${build} return { render(t) { ${render} } }; }`;
const URL_BASE = `http://127.0.0.1:${CANARY_PORT}`;
const SCENES: Record<string, string> = {
  'a plain scene, which must pass': scene(''),
  'spins while it builds': scene('while (true) {}'),
  'spins in render': scene('', 'for (;;) {}'),
  'calls fetch': scene(`fetch('${URL_BASE}/fetch').catch(() => {});`),
  'reaches fetch with no name for it': scene(`const f = (0, kit.constructor.constructor)('return fetch')(); f('${URL_BASE}/hidden').catch(() => {});`),
  'loads an image': scene(`const i = new Image(); i.src = '${URL_BASE}/image';`),
  'adds a script': scene(`const s = document.createElement('script'); s.src = '${URL_BASE}/script'; document.head.append(s);`),
  'opens a socket': scene(`new WebSocket('ws://127.0.0.1:${CANARY_PORT}/socket');`),
  'moves its frame': scene('', `if (t > 1) location.href = '${URL_BASE}/moved?secret=scene';`),
  'draws nothing': `function scene(kit) { kit.stage('space', { sky: 0, stars: 0 }); kit.post.set({ exposure: 0 }); kit.at('b'); return { render() {} }; }`,
  'keeps state between frames': scene('let n = 0;', "n += 1; ball.scale(1 + n / 3); kit.p(t, 'b');"),
  'throws in render': scene('', "throw new Error('broken');"),
  'throws while it builds': scene("kit.nothing.here();"),
};

const check = createFrameCheck();
let isBad = false;
for (const [name, code] of Object.entries(SCENES)) {
  const byCode = getKitCodeProblems({ code, topic: 'a ball', moments: MOMENTS });
  const startedAt = performance.now();
  const frames = await check({ code, moments: MOMENTS, durationSeconds: 5, seconds: [1.2, 3.3] }, AbortSignal.timeout(40_000)).catch((error: unknown) => ({ isOk: false as const, reasons: [String(error)] }));
  const shouldPass = name.startsWith('a plain');
  const isHeld = shouldPass ? frames.isOk && byCode.length === 0 : !frames.isOk || byCode.length > 0;
  if (!isHeld) isBad = true;
  console.log(`${isHeld ? 'ok  ' : 'FAIL'} ${name} | code check: ${byCode.length > 0 ? 'refused' : 'passed'} | frames: ${frames.isOk ? 'passed' : `refused, ${frames.reasons.join('; ').slice(0, 110)}`} | ${Math.round(performance.now() - startedAt)} ms`);
}
await new Promise((resolve) => setTimeout(resolve, 800));
console.log(`requests that reached the canary: ${JSON.stringify(hits)}`);
canary.close();
process.exit(isBad || hits.length > 0 ? 1 : 0);
