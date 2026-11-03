import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  getFreePort,
  getListenerProcessIds,
  getProcessCommand,
  getProcessGroupId,
  getProcessStartTime,
  isProcessGroupAlive,
  isProcessGroupCarrying,
  isProcessGroupInDirectory,
  signalProcessGroup,
  spawnProcessGroup,
} from './processes.mjs';
import { DEV_LOG_PATH, POLL_INTERVAL_MS, REPO_ROOT, RUN_STATE_PATH, TIMEOUTS_MS } from './settings.mjs';

const DEV_COMMAND = { command: 'pnpm', args: ['dev'] };
// "pnpm --silent verify" passes a silent reporter down, which would empty the dev log.
const DEV_LOG_ENV = { NO_COLOR: '1', npm_config_reporter: 'append-only' };
const RUN_ID_VARIABLE = 'VERIFY_RUN_ID';
const COMPILE_RESULT_PATTERN = /^apps\/api dev: .*(Found (\d+) errors?)\b/gm;
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
  const runId = randomUUID();
  const processGroupId = spawnProcessGroup({
    ...DEV_COMMAND,
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...DEV_LOG_ENV,
      WEB_PORT: String(webPort),
      API_PORT: String(apiPort),
      [RUN_ID_VARIABLE]: runId,
    },
    logPath: DEV_LOG_PATH,
  });
  const leaderStartTime = getProcessStartTime(processGroupId);
  const run = { processGroupId, leaderStartTime, runId, webPort, apiPort, logPath: DEV_LOG_PATH };
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

function getCompileCheck() {
  const results = [...readFileSync(DEV_LOG_PATH, 'utf8').matchAll(COMPILE_RESULT_PATTERN)];
  const latestResult = results.at(-1);
  if (!latestResult) return { name: 'api compile', passed: false, detail: `no compile result in ${DEV_LOG_PATH}` };
  const [, resultText, errorCount] = latestResult;
  const passed = Number(errorCount) === 0;
  const consequence = passed ? '' : `, so the API is an old build or none. Read ${DEV_LOG_PATH}`;
  return { name: 'api compile', passed, detail: `the latest compile says "${resultText}"${consequence}` };
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

// Probes the proxy only once the API answers, because each failed probe writes a proxy error to the dev log.
async function getProxyCheck({ run, apiCheck }) {
  const name = 'dev proxy reaches api';
  if (!apiCheck.passed) return { name, passed: false, detail: 'not probed, because the API does not answer' };
  return getAnswerCheck({ name, url: `${getWebUrl(run)}/api/health`, isExpectedBody: isHealthBody });
}

export async function getAppChecks(run) {
  const { processGroupId, webPort, apiPort } = run;
  const apiCheck = await getAnswerCheck({
    name: 'api answers',
    url: `${getApiUrl(run)}/health`,
    isExpectedBody: isHealthBody,
  });
  return [
    getPortOwnerCheck({ name: 'web port owner', port: webPort, processGroupId }),
    getPortOwnerCheck({ name: 'api port owner', port: apiPort, processGroupId }),
    getCompileCheck(),
    await getAnswerCheck({ name: 'web answers', url: getWebUrl(run), isExpectedBody: isAppPage }),
    apiCheck,
    await getProxyCheck({ run, apiCheck }),
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
    const stopFailure = await stopApp().then(
      () => '',
      (stopError) => `\n${stopError.message}`,
    );
    throw new Error(`${error.message}${stopFailure}\n--- last lines of ${DEV_LOG_PATH} ---\n${logTail}`);
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
  const killed = await waitForProcessGroupExit({ processGroupId, timeoutMs: TIMEOUTS_MS.shutdownGrace });
  if (!killed) throw new Error(`Process group ${processGroupId} survived SIGKILL.`);
}

function assertPortsReleased({ webPort, apiPort }) {
  const holders = [webPort, apiPort].flatMap((port) =>
    getListenerProcessIds(port).map((processId) => `port ${port}: ${processId} (${getProcessCommand(processId)})`),
  );
  if (holders.length === 0) return;
  throw new Error(
    `Still listening after stop.\n${holders.join('\n')}\n${RUN_STATE_PATH} stays until these ports are free.`,
  );
}

// A group id can be reused, so compare the leader's start time. A group whose leader died still carries the run id.
function isThisRunsProcessGroup({ processGroupId, leaderStartTime, runId }) {
  if (!isProcessGroupAlive(processGroupId)) return false;
  const currentLeaderStartTime = getProcessStartTime(processGroupId);
  const isSameRun = currentLeaderStartTime
    ? currentLeaderStartTime === leaderStartTime
    : isProcessGroupCarrying({ processGroupId, environmentEntry: `${RUN_ID_VARIABLE}=${runId}` });
  return isSameRun && isProcessGroupInDirectory(processGroupId, REPO_ROOT);
}

export async function stopApp() {
  const run = readRun();
  if (!run) return false;
  const isOurs = isThisRunsProcessGroup(run);
  if (isOurs) await terminateProcessGroup(run.processGroupId);
  assertPortsReleased(run);
  rmSync(RUN_STATE_PATH, { force: true });
  return isOurs;
}
