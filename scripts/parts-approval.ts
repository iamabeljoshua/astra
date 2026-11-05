import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { join } from 'node:path';
import { getCoreSource, getPartCatalogue, isPartApproved, readPartApprovals, writePartApproval } from '../apps/agent/src/scenes/recipe/catalogue.ts';
import { compileRecipe, getRecipeTiming } from '../apps/agent/src/scenes/recipe/recipe.ts';
import { getWholePartRecipe } from '../apps/agent/src/scenes/recipe/whole-part.ts';
import { buildKitFramePage, getNeededTextures } from '../packages/board/src/scene3d/index.ts';
import { SCENE_ENGINE_VERSIONS } from '../packages/contracts/src/index.ts';

const ROOT = join(import.meta.dirname, '..');
const KIT_FILE = join(ROOT, 'apps/web/public/scene-kit', SCENE_ENGINE_VERSIONS.kit, 'kit.js');
const TEXTURES_FOLDER = join(ROOT, 'apps/web/public/scene-kit/textures');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PARTS_PORT || 7670);
const TEXTURE_NAME = /^\w+$/;
const TEXTURE_ROUTE = '/texture/';

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Parts approval</title><style>
body{margin:0;height:100vh;display:grid;grid-template-columns:240px 1fr;background:#111;color:#eee;font:14px/1.45 system-ui,sans-serif}
nav{overflow:auto;border-right:1px solid #333;padding:8px}
nav button{display:flex;justify-content:space-between;width:100%;padding:5px 8px;background:none;color:inherit;border:0;cursor:pointer}
nav button[aria-current=true]{background:#333}
.yes{color:#7fd67f}.no{color:#888}
main{overflow:auto;padding:12px}
#stage{position:relative;aspect-ratio:16/9;max-height:68vh;background:#000}
#stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
#controls{display:flex;gap:12px;align-items:center;margin:10px 0}
#time{flex:1}#problem{color:#ff8a7a;white-space:pre-wrap}
dt{color:#888;margin-top:6px}dd{margin:0;white-space:pre-wrap}
</style></head><body>
<nav id="list"></nav>
<main>
<div id="stage"></div>
<div id="controls">
<button id="play">Pause</button><input id="time" type="range" min="0" step="0.01" value="0"><span id="clock"></span>
<label><input id="dark" type="checkbox" checked> Dark</label><label><input id="flat" type="checkbox"> Flat</label>
<button id="approve">Approve</button><button id="notYet">Not yet</button>
</div>
<div id="problem"></div>
<h2 id="name"></h2><dl id="facts"></dl>
</main>
<script>
const byId = (id) => document.getElementById(id);
const make = (tag, text, className = '') => Object.assign(document.createElement(tag), { textContent: text, className });
const showProblem = (text) => { byId('problem').textContent = text; };
let parts = [], selected = null, frame = null, take = null, isReady = false, isPlaying = true, seconds = 0, lastNow = performance.now(), latestOpen = 0;

const tell = (command) => frame?.contentWindow?.postMessage(command, '*');

function drawPart() {
  byId('list').replaceChildren(...parts.map((part) => {
    const row = make('button', part.name);
    row.setAttribute('aria-current', String(part.name === selected));
    row.append(make('span', part.isApproved ? 'approved' : 'not yet', part.isApproved ? 'yes' : 'no'));
    row.onclick = () => select(part.name);
    return row;
  }));
  const part = parts.find(({ name }) => name === selected);
  byId('name').textContent = part.name;
  const motions = Object.entries(part.motions).map(([name, what]) => name + ': ' + what).join('\\n');
  const facts = [['Doc', part.doc], ['Args', part.args || 'none'], ['Anchors', part.anchors.join(', ') || 'none'], ['Motions', motions || 'none']];
  byId('facts').replaceChildren(...facts.flatMap(([title, text]) => [make('dt', title), make('dd', text)]));
}

async function getTextures(names) {
  const files = await Promise.all(names.map(async (name) => [name, new Blob([await (await fetch('/texture/' + name)).arrayBuffer()])]));
  return Object.fromEntries(files);
}

async function openFrame() {
  const opening = (latestOpen += 1);
  const reply = await fetch('/frame?' + new URLSearchParams({ part: selected, flat: byId('flat').checked ? '1' : '0' }));
  if (!reply.ok) return showProblem(await reply.text());
  const made = await reply.json();
  const textures = await getTextures(made.textures);
  if (opening !== latestOpen) return;
  tell({ type: 'dispose' });
  frame?.remove();
  isReady = false;
  showProblem('');
  take = { timing: made.timing, textures };
  byId('time').max = String(made.timing.duration);
  frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.srcdoc = made.page;
  byId('stage').append(frame);
}

function select(name) {
  selected = name;
  seconds = 0;
  drawPart();
  void openFrame();
}

function setPlaying(next) {
  isPlaying = next;
  byId('play').textContent = next ? 'Pause' : 'Play';
}

async function sendApproval(isApproved) {
  const reply = await fetch('/approval', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: selected, isApproved }) });
  if (!reply.ok) return showProblem(await reply.text());
  parts = await reply.json();
  drawPart();
}

function tick(now) {
  if (isReady) {
    if (isPlaying) seconds = (seconds + (now - lastNow) / 1000) % take.timing.duration;
    tell({ type: 'render', seconds });
    byId('time').value = String(seconds);
    byId('clock').textContent = seconds.toFixed(1) + ' / ' + take.timing.duration.toFixed(1) + ' s';
  }
  lastNow = now;
  requestAnimationFrame(tick);
}

addEventListener('message', (event) => {
  if (event.source !== frame?.contentWindow) return;
  const reply = event.data;
  if (reply.type === 'loaded') tell({ type: 'load', timing: take.timing, textures: take.textures, theme: byId('dark').checked ? 'dark' : 'light' });
  if (reply.type === 'ready') {
    isReady = true;
    showProblem(reply.issues.join('\\n'));
  }
  if (reply.type === 'error') showProblem(reply.phase + ': ' + reply.message);
});
addEventListener('resize', () => tell({ type: 'resize' }));
byId('play').onclick = () => setPlaying(!isPlaying);
byId('time').oninput = (event) => {
  setPlaying(false);
  seconds = Number(event.target.value);
};
byId('dark').onchange = openFrame;
byId('flat').onchange = openFrame;
byId('approve').onclick = () => sendApproval(true);
byId('notYet').onclick = () => sendApproval(false);

fetch('/parts').then((reply) => reply.json()).then((rows) => {
  parts = rows;
  select(parts[0].name);
  requestAnimationFrame(tick);
});
</script></body></html>`;

interface Reply {
  status: number;
  type: string;
  body: string | Buffer;
}

const toJson = (value: unknown): Reply => ({ status: 200, type: 'application/json', body: JSON.stringify(value) });
const toProblem = (status: number, problem: string): Reply => ({ status, type: 'text/plain; charset=utf-8', body: problem });

function getPartRows() {
  const approvals = readPartApprovals();
  return [...getPartCatalogue().values()].map(({ source: _source, ...part }) => ({ ...part, isApproved: isPartApproved(part, approvals) }));
}

function getFrame(url: URL): Reply {
  const part = getPartCatalogue().get(url.searchParams.get('part') ?? '');
  if (!part) return toProblem(404, 'no such part');
  const recipe = getWholePartRecipe(part);
  const code = compileRecipe(recipe, { core: getCoreSource(), parts: getPartCatalogue() });
  const { moments, durationSeconds } = getRecipeTiming(recipe.says);
  const page = buildKitFramePage({ kitBundle: readFileSync(KIT_FILE, 'utf8'), code, drawsFlat: url.searchParams.get('flat') === '1' });
  return toJson({ page, timing: { moments, duration: durationSeconds }, textures: getNeededTextures(code) });
}

function getTexture(name: string): Reply {
  const file = join(TEXTURES_FOLDER, `${name}.${name.endsWith('alpha') ? 'png' : 'jpg'}`);
  if (!TEXTURE_NAME.test(name) || !existsSync(file)) return toProblem(404, 'no such texture');
  return { status: 200, type: 'application/octet-stream', body: readFileSync(file) };
}

async function setApproval(request: IncomingMessage): Promise<Reply> {
  // A plain form post from another site cannot set this header, so a page open in the same browser cannot approve a part.
  if (request.headers['content-type'] !== 'application/json') return toProblem(415, 'send JSON');
  let text = '';
  for await (const chunk of request) text += String(chunk);
  const { name, isApproved } = JSON.parse(text) as { name?: unknown; isApproved?: unknown };
  if (typeof name !== 'string' || !getPartCatalogue().has(name) || typeof isApproved !== 'boolean') return toProblem(400, 'needs a known part name and isApproved');
  writePartApproval({ name, isApproved });
  return toJson(getPartRows());
}

async function getReply(request: IncomingMessage): Promise<Reply> {
  const url = new URL(request.url ?? '/', `http://${HOST}`);
  const route = `${request.method} ${url.pathname}`;
  if (route === 'GET /') return { status: 200, type: 'text/html; charset=utf-8', body: PAGE };
  if (route === 'GET /parts') return toJson(getPartRows());
  if (route === 'GET /frame') return getFrame(url);
  if (route === 'POST /approval') return setApproval(request);
  if (request.method === 'GET' && url.pathname.startsWith(TEXTURE_ROUTE)) return getTexture(url.pathname.slice(TEXTURE_ROUTE.length));
  return toProblem(404, 'no such route');
}

createServer((request, response) => {
  getReply(request)
    .catch((error: unknown) => toProblem(400, String(error)))
    .then(({ status, type, body }) => response.writeHead(status, { 'content-type': type }).end(body));
}).listen(PORT, HOST, () => console.log(`Parts approval: http://${HOST}:${PORT}`));
