import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  getFreePort,
  getListenerProcessIds,
  getProcessCommand,
  getProcessGroupId,
  isProcessGroupAlive,
  isProcessGroupInDirectory,
  signalProcessGroup,
  spawnProcessGroup,
} from './processes.mjs';
import { DEV_LOG_PATH, POLL_INTERVAL_MS, REPO_ROOT, RUN_STATE_PATH, TIMEOUTS_MS } from './settings.mjs';

const DEV_COMMAND = { command: 'pnpm', args: ['dev'] };
// "pnpm --silent verify" passes a silent reporter down, which would empty the dev log.
const DEV_LOG_ENV = { NO_COLOR: '1', npm_config_reporter: 'append-only' };
const LOG_TAIL_LINES = 30;
const HIGHEST_PORT = 65_535;
const APP_ROOT_MARKUP = 'id="root"';
const BODY_EXCERPT_LENGTH = 60;

export function getWebUrl(run) {
  return `http://localhost:${run.webPort}`;
}

export function getApiUrl(run) {
  return `http://localhost:${run.apiPort}`;
}

function parsePort(name) {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > HIGHEST_PORT) {
    throw new Error(`${name} must be a port number. Received "${value}".`);
  }
  return port;
}

async function getRequestedPorts() {
  const webPort = parsePort('WEB_PORT') ?? (await getFreePort());
  const apiPort = parsePort('API_PORT') ?? (await getFreePort());
  return { webPort, apiPort };
}

function assertPortIsFree({ name, port }) {
  const listeners = getListenerProcessIds(port);
  if (listeners.length === 0) return;
  const owners = listeners.map((processId) => `${processId} (${getProcessCommand(processId)})`);
  throw new Error(`${name} ${port} is taken by process ${owners.join(', ')}. Choose another port.`);
}

function launchDevServers({ webPort, apiPort }) {
  mkdirSync(dirname(RUN_STATE_PATH), { recursive: true });
  const processGroupId = spawnProcessGroup({
    ...DEV_COMMAND,
    cwd: REPO_ROOT,
    env: { ...process.env, ...DEV_LOG_ENV, WEB_PORT: String(webPort), API_PORT: String(apiPort) },
    logPath: DEV_LOG_PATH,
  });
  const run = { processGroupId, webPort, apiPort, logPath: DEV_LOG_PATH };
  writeFileSync(RUN_STATE_PATH, JSON.stringify(run, null, 2));
  return run;
}

function getPortOwnerCheck({ name, port, processGroupId }) {
  const listeners = getListenerProcessIds(port);
  const foreign = listeners.filter((processId) => getProcessGroupId(processId) !== processGroupId);
  const isOurs = listeners.length > 0 && foreign.length === 0;
  const detail = isOurs
    ? `port ${port} is held only by this run`
    : `port ${port} listeners ${listeners.join(', ') || 'none'}, not from this run ${foreign.join(', ') || 'none'}`;
  return { name, passed: isOurs, detail };
}

function isHealthBody(body) {
  try {
    return JSON.parse(body).status === 'ok';
  } catch {
    return false;
  }
}

function isAppPage(body) {
  return body.includes(APP_ROOT_MARKUP);
}

async function getAnswerCheck({ name, url, isExpectedBody }) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUTS_MS.httpProbe) });
    const body = await response.text();
    const excerpt = JSON.stringify(body.slice(0, BODY_EXCERPT_LENGTH));
    const passed = response.ok && isExpectedBody(body);
    return { name, passed, detail: `${url} answered ${response.status} ${excerpt}` };
  } catch (error) {
    return { name, passed: false, detail: `${url} did not answer: ${error.message}` };
  }
}

export async function getAppChecks(run) {
  const { processGroupId, webPort, apiPort } = run;
  return [
    getPortOwnerCheck({ name: 'web port owner', port: webPort, processGroupId }),
    getPortOwnerCheck({ name: 'api port owner', port: apiPort, processGroupId }),
    await getAnswerCheck({ name: 'web answers', url: getWebUrl(run), isExpectedBody: isAppPage }),
    await getAnswerCheck({
      name: 'api answers',
      url: `${getApiUrl(run)}/health`,
      isExpectedBody: isHealthBody,
    }),
    await getAnswerCheck({
      name: 'dev proxy reaches api',
      url: `${getWebUrl(run)}/api/health`,
      isExpectedBody: isHealthBody,
    }),
  ];
}

function getLogTail() {
  return readFileSync(DEV_LOG_PATH, 'utf8').split('\n').slice(-LOG_TAIL_LINES).join('\n');
}

function describeFailedChecks(checks) {
  return checks
    .filter((check) => !check.passed)
    .map((check) => `${check.name}: ${check.detail}`)
    .join('\n');
}

async function waitUntilReady(run) {
  const deadline = Date.now() + TIMEOUTS_MS.appReady;
  let checks = await getAppChecks(run);
  while (!checks.every((check) => check.passed)) {
    if (!isProcessGroupAlive(run.processGroupId)) throw new Error('pnpm dev exited during startup.');
    if (Date.now() > deadline) throw new Error(`App not ready.\n${describeFailedChecks(checks)}`);
    await sleep(POLL_INTERVAL_MS);
    checks = await getAppChecks(run);
  }
}

// Starts fresh every time, replacing whatever this checkout started earlier.
export async function startApp() {
  await stopApp();
  const { webPort, apiPort } = await getRequestedPorts();
  assertPortIsFree({ name: 'WEB_PORT', port: webPort });
  assertPortIsFree({ name: 'API_PORT', port: apiPort });
  const run = launchDevServers({ webPort, apiPort });
  try {
    await waitUntilReady(run);
  } catch (error) {
    const logTail = getLogTail();
    await stopApp();
    throw new Error(`${error.message}\n--- last lines of ${DEV_LOG_PATH} ---\n${logTail}`);
  }
  return run;
}

function readRun() {
  if (!existsSync(RUN_STATE_PATH)) return undefined;
  return JSON.parse(readFileSync(RUN_STATE_PATH, 'utf8'));
}

export function requireRun() {
  const run = readRun();
  if (!run) throw new Error('Astra is not running. Run "pnpm verify start" first.');
  return run;
}

export async function getHealthyRun() {
  const run = requireRun();
  const failures = describeFailedChecks(await getAppChecks(run));
  if (failures) throw new Error(`This run is not healthy. Run "pnpm verify doctor".\n${failures}`);
  return run;
}

async function waitForProcessGroupExit({ processGroupId, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  while (isProcessGroupAlive(processGroupId) && Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
  }
  return !isProcessGroupAlive(processGroupId);
}

async function terminateProcessGroup(processGroupId) {
  signalProcessGroup(processGroupId, 'SIGTERM');
  const exited = await waitForProcessGroupExit({ processGroupId, timeoutMs: TIMEOUTS_MS.shutdownGrace });
  if (exited) return;
  signalProcessGroup(processGroupId, 'SIGKILL');
  await waitForProcessGroupExit({ processGroupId, timeoutMs: TIMEOUTS_MS.shutdownGrace });
}

function assertPortsReleased({ webPort, apiPort }) {
  const leftovers = [webPort, apiPort].filter((port) => getListenerProcessIds(port).length > 0);
  if (leftovers.length > 0) throw new Error(`Still listening after stop: ${leftovers.join(', ')}.`);
}

// Safe to run twice and after a crash, because it acts only on the group this checkout recorded.
export async function stopApp() {
  const run = readRun();
  if (!run) return false;
  const isOurs = isProcessGroupInDirectory(run.processGroupId, REPO_ROOT);
  if (isOurs) await terminateProcessGroup(run.processGroupId);
  rmSync(RUN_STATE_PATH);
  if (isOurs) assertPortsReleased(run);
  return isOurs;
}
