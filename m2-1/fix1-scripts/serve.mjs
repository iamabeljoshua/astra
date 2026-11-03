// Serves a production web build and forwards /api to the real API, with switchable answers for /api/home.
import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const [dist, webPort = '5511', apiPort = '3511'] = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
let mode = { home: 'real', fontDelayMs: 0, session: '' };

function forwardToApi(request, response) {
  const upstream = http.request(
    { host: '127.0.0.1', port: apiPort, path: request.url.replace(/^\/api/, ''), method: request.method, headers: request.headers },
    (answer) => {
      response.writeHead(answer.statusCode, answer.headers);
      answer.pipe(response);
    },
  );
  upstream.on('error', () => { response.writeHead(502); response.end(); });
  request.pipe(upstream);
}

function fetchHomeFromApi() {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: apiPort, path: '/home' }, (answer) => {
      let body = '';
      answer.on('data', (chunk) => { body += chunk; });
      answer.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

async function answerHome(request, response) {
  const json = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)); };
  if (mode.home === 'hang') return;
  if (mode.home === 'wrong') return json(200, { studentName: 'Maya' });
  if (mode.home === 'wrong-picks') return json(200, { studentName: 'Maya', continueSession: null, picks: 'not a list' });
  if (mode.home === '500') return json(500, { statusCode: 500, message: 'Internal server error' });
  if (mode.home === 'artwork') {
    const home = await fetchHomeFromApi();
    home.continueSession.artwork = mode.session;
    home.picks[0].artwork = 'unknown-name';
    home.picks[1].artwork = 'constructor';
    return json(200, home);
  }
  forwardToApi(request, response);
}

http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://x');
  if (url.pathname === '/__mode') {
    for (const [key, value] of url.searchParams) mode[key] = key === 'fontDelayMs' ? Number(value) : value;
    response.end(JSON.stringify(mode));
    return;
  }
  if (url.pathname === '/api/home') return answerHome(request, response);
  if (url.pathname.startsWith('/api/')) return forwardToApi(request, response);
  const file = join(dist, url.pathname);
  const isFile = url.pathname !== '/' && existsSync(file) && statSync(file).isFile();
  const body = readFileSync(isFile ? file : join(dist, 'index.html'));
  const type = isFile ? TYPES[extname(file)] ?? 'application/octet-stream' : 'text/html';
  if (type === 'font/woff2' && mode.fontDelayMs) await new Promise((resolve) => setTimeout(resolve, mode.fontDelayMs));
  response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(body);
}).listen(Number(webPort), '127.0.0.1');
