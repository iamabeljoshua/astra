// Failure lab. Each browser context names its lane with an x-lab header, so lanes fail independently.
// 6041 Auth as the browser sees it. 6043 Auth as the API sees it (issuer). 6046 Auth with an empty key set.
// 6040 built web and /api forwarder. 6044 another site. 6045 control. 6042 private Auth container.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const DIST = process.env.DIST ?? '/path/to/m2-9/dist';
const AUTH_PORT = 6042;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*, apikey, authorization, content-type, x-client-info, x-supabase-api-version, x-lab', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-max-age': '0' };
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const DEFAULTS = () => ({ auth: {}, api: {}, docDelayMs: 0, docMode: 'normal', apiPort: 3040 });
const lanes = new Map();
const laneOf = (name) => { if (!lanes.has(name)) lanes.set(name, { state: DEFAULTS(), events: [] }); return lanes.get(name); };
const laneName = (req) => req.headers['x-lab'] ?? 'none';
const record = (lane, entry) => { const e = { at: Date.now(), ...entry }; lane.events.push(e); if (lane.events.length > 20000) lane.events = lane.events.slice(-10000); return e; };
const authOp = (url) => { if (url.pathname.endsWith('jwks.json')) return 'jwks'; const op = url.pathname.split('/').pop(); return op === 'token' ? `token:${url.searchParams.get('grant_type')}` : op; };
function body(req) { return new Promise((resolve) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => resolve(Buffer.concat(c))); req.on('error', () => resolve(Buffer.concat(c))); }); }
function json(res, status, value, extra = {}) { const p = Buffer.from(JSON.stringify(value)); res.writeHead(status, { 'content-type': 'application/json', 'content-length': p.length, ...extra }); res.end(p); }
function forwardToAuth({ req, res, url, payload, extraHeaders = {}, onAnswer, delayAnswerMs = 0 }) {
  const headers = { ...req.headers, host: `127.0.0.1:${AUTH_PORT}` };
  delete headers['x-lab'];
  const proxied = http.request({ host: '127.0.0.1', port: AUTH_PORT, method: req.method, path: url.pathname.replace(/^\/auth\/v1/, '') + url.search, headers }, (answer) => {
    const chunks = []; answer.on('data', (d) => chunks.push(d)); answer.on('end', () => {
      onAnswer?.(answer.statusCode);
      const send = () => { if (!res.destroyed) { res.writeHead(answer.statusCode, { ...answer.headers, ...extraHeaders }); res.end(Buffer.concat(chunks)); } };
      if (delayAnswerMs) setTimeout(send, delayAnswerMs); else send();
    });
  });
  proxied.on('error', () => { json(res, 502, { code: 502, msg: 'bad gateway' }, extraHeaders); onAnswer?.(502); });
  proxied.end(payload);
}
const sockets = new Set();
const authFace = http.createServer(async (req, res) => {
  const lane = laneOf(laneName(req));
  const url = new URL(req.url, 'http://x');
  const op = authOp(url);
  const mode = lane.state.auth[op] ?? lane.state.auth[op.split(':')[0]] ?? lane.state.auth.all ?? 'normal';
  const entry = record(lane, { kind: 'auth', method: req.method, op, mode, query: op === 'logout' ? url.search : undefined });
  res.on('close', () => { entry.ms = Date.now() - entry.at; entry.closedEarly = !res.writableEnded; });
  const payload = await body(req);
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); entry.status = 204; return; }
  if (mode === 'hang') return;
  if (mode === 'reset') { req.socket.destroy(); entry.status = 'reset'; return; }
  if (String(mode).startsWith('status:')) {
    const [, statusText, code] = mode.split(':');
    const status = Number(statusText);
    json(res, status, { code: status, error_code: code ?? (status === 429 ? 'over_request_rate_limit' : 'unexpected_failure'), msg: 'injected' }, { ...CORS, 'x-supabase-api-version': '2024-01-01' });
    entry.status = status; return;
  }
  if (String(mode).startsWith('html:')) {
    const status = Number(mode.split(':')[1]);
    res.writeHead(status, { 'content-type': 'text/html', ...CORS }); res.end('<html><body>Gateway says no</body></html>');
    entry.status = status; return;
  }
  const go = () => forwardToAuth({ req, res, url, payload, extraHeaders: CORS, onAnswer: (status) => { entry.status = status; }, delayAnswerMs: String(mode).startsWith('delayresp:') ? Number(mode.split(':')[1]) : 0 });
  if (String(mode).startsWith('delay:')) setTimeout(go, Number(mode.split(':')[1])); else go();
});
authFace.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
let faceListening = false;
const setFaceListening = (on) => new Promise((resolve) => {
  if (on === faceListening) return resolve();
  faceListening = on;
  if (on) return authFace.listen(6041, '127.0.0.1', resolve);
  authFace.close(() => resolve());
  for (const s of sockets) s.destroy();
});
const authIssuer = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  forwardToAuth({ req, res, url, payload: await body(req) });
});
const emptyKeys = http.createServer((req, res) => json(res, 200, { keys: [] }));
const web = http.createServer(async (req, res) => {
  const lane = laneOf(laneName(req));
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api')) {
    const op = url.pathname.replace(/^\/api/, '');
    const mode = lane.state.api[op] ?? lane.state.api.all ?? 'normal';
    const entry = record(lane, { kind: 'api', method: req.method, op, hadToken: !!req.headers.authorization, mode });
    res.on('close', () => { entry.ms = Date.now() - entry.at; entry.closedEarly = !res.writableEnded; });
    const payload = await body(req);
    if (mode === 'hang') return;
    if (mode === 'reset') { req.socket.destroy(); entry.status = 'reset'; return; }
    if (String(mode).startsWith('status:')) { const s = Number(mode.split(':')[1]); json(res, s, { statusCode: s, message: 'injected' }); entry.status = s; return; }
    const headers = { ...req.headers }; delete headers['x-lab'];
    const go = () => {
      const proxied = http.request({ host: '127.0.0.1', port: lane.state.apiPort, method: req.method, path: url.pathname.replace(/^\/api/, '') + url.search, headers }, (answer) => {
        const chunks = []; answer.on('data', (d) => chunks.push(d)); answer.on('end', () => {
          entry.status = answer.statusCode;
          const send = () => { if (!res.destroyed) { res.writeHead(answer.statusCode, answer.headers); res.end(Buffer.concat(chunks)); } };
          if (String(mode).startsWith('delayresp:')) setTimeout(send, Number(mode.split(':')[1])); else send();
        });
      });
      proxied.on('error', () => { json(res, 502, { statusCode: 502, message: 'Bad gateway' }); entry.status = 502; });
      proxied.end(payload);
    };
    if (String(mode).startsWith('delay:')) setTimeout(go, Number(mode.split(':')[1])); else go();
    return;
  }
  const path = normalize(url.pathname);
  const isDocument = !extname(path);
  if (isDocument) {
    record(lane, { kind: 'doc', method: req.method, op: path, delay: lane.state.docDelayMs, mode: lane.state.docMode });
    if (lane.state.docMode === 'hang') return;
    if (lane.state.docMode === 'reset') { req.socket.destroy(); return; }
    if (lane.state.docMode === '204') { res.writeHead(204); res.end(); return; }
    if (lane.state.docMode === '500') { res.writeHead(500, { 'content-type': 'text/plain' }); res.end('Bad day'); return; }
    if (lane.state.docDelayMs) await new Promise((r) => setTimeout(r, lane.state.docDelayMs));
  }
  const headers = { 'cache-control': 'public, max-age=0, must-revalidate' };
  try {
    const file = path === '/' ? '/index.html' : path;
    const data = await readFile(join(DIST, file));
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', ...headers }); res.end(data);
  } catch {
    const data = await readFile(join(DIST, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html', ...headers }); res.end(data);
  }
});
const otherSite = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'public, max-age=0, must-revalidate' });
  res.end('<!doctype html><title>Another site</title><h1>Another site</h1>');
});
const control = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const lane = laneOf(url.searchParams.get('lane') ?? 'none');
  if (url.pathname === '/set') {
    const change = JSON.parse((await body(req)).toString() || '{}');
    if (change.authListening !== undefined) { await setFaceListening(change.authListening); delete change.authListening; }
    Object.assign(lane.state, change);
    return json(res, 200, { ...lane.state, faceListening });
  }
  if (url.pathname === '/reset') { lane.state = DEFAULTS(); lane.events = []; return json(res, 200, {}); }
  if (url.pathname === '/events') return json(res, 200, lane.events);
  if (url.pathname === '/clear') { lane.events = []; return json(res, 200, {}); }
  json(res, 404, {});
});
await setFaceListening(true);
authIssuer.listen(6043, '127.0.0.1');
emptyKeys.listen(6046, '127.0.0.1');
web.listen(6040, '127.0.0.1');
otherSite.listen(6044, '127.0.0.1');
control.listen(6045, '127.0.0.1', () => console.log('lab up'));
