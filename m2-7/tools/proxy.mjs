// Sits in front of the web server. Passes pages through, and applies the current mode to /api calls.
import http from 'node:http';
import net from 'node:net';

const [, , listenPort, upstreamText] = process.argv;
const upstream = new URL(upstreamText);
const SLOW_ANSWER_MS = 5000;
let mode = 'pass';
let calls = [];

function forward(request, response) {
  const options = { host: upstream.hostname, port: upstream.port, path: request.url, method: request.method, headers: request.headers };
  const upstreamRequest = http.request(options, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstreamRequest.on('error', () => response.destroy());
  request.pipe(upstreamRequest);
}

const API_MODES = {
  pass: forward,
  hang: () => undefined,
  slow: (request, response) => setTimeout(() => forward(request, response), SLOW_ANSWER_MS),
  fail500: (_request, response) => response.writeHead(500, { 'content-type': 'application/json' }).end('{}'),
  reset: (request) => request.socket.destroy(),
};

function recordApiCall(request, response) {
  const call = { path: request.url, mode, arrivedAt: Date.now(), answeredAt: null, closedByBrowserAt: null };
  calls.push(call);
  response.on('close', () => {
    if (response.writableFinished) call.answeredAt = Date.now();
    else call.closedByBrowserAt = Date.now();
  });
}

const server = http.createServer((request, response) => {
  if (request.url.startsWith('/__proxy/mode/')) {
    mode = request.url.split('/').pop();
    response.end(mode);
  } else if (request.url === '/__proxy/calls') {
    response.end(JSON.stringify(calls));
  } else if (request.url === '/__proxy/clear') {
    calls = [];
    response.end('cleared');
  } else if (request.url.startsWith('/api/')) {
    recordApiCall(request, response);
    API_MODES[mode](request, response);
  } else {
    forward(request, response);
  }
});

server.on('upgrade', (request, clientSocket, head) => {
  const upstreamSocket = net.connect(Number(upstream.port), upstream.hostname, () => {
    const headerLines = Object.entries(request.headers).map(([name, value]) => `${name}: ${value}`);
    upstreamSocket.write(`${request.method} ${request.url} HTTP/1.1\r\n${headerLines.join('\r\n')}\r\n\r\n`);
    upstreamSocket.write(head);
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  });
  upstreamSocket.on('error', () => clientSocket.destroy());
  clientSocket.on('error', () => upstreamSocket.destroy());
});

server.listen(Number(listenPort), 'localhost', () => console.log(`proxy on ${listenPort} to ${upstreamText}`));
