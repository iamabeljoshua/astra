#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  getFreePort,
  getListenerProcessIds,
  getProcessGroupId,
  getProcessStartTime,
  isProcessGroupAlive,
  PROCESS_LIST_MAX_BYTES,
} from './lib/processes.mjs';
import { POLL_INTERVAL_MS, REPO_ROOT, SKILL_ROOT, VIEWPORTS } from './lib/settings.mjs';

const CLI_PATH = join(SKILL_ROOT, 'scripts/verify.mjs');
const FIXTURES_DIR = join(SKILL_ROOT, 'scripts/fixtures');
const APP_PROCESS_MARKER = join(REPO_ROOT, 'apps');
const PNG_WIDTH_OFFSET = 16;
const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1'];
const UNUSED_PORT = 1;
const LEADER_EXIT_TIMEOUT_MS = 5_000;
const CLI_TIMEOUT_MS = 90_000;
const BOTH_VIEWPORTS = Object.keys(VIEWPORTS).join(',');

const ASTRA_TITLE = '<!doctype html><title>Astra</title>';
const BLANK_PAGES = {
  'opacity 0': `${ASTRA_TITLE}<main style="opacity: 0"><h1>Astra</h1></main>`,
  'white on white': `${ASTRA_TITLE}<main style="color: white"><h1>Astra</h1></main>`,
  'content off screen': `${ASTRA_TITLE}<main style="position: absolute; left: -9999px"><h1>Astra</h1></main>`,
  'an empty body': ASTRA_TITLE,
};
const PLAIN_PAGES = {
  'one word on white': `${ASTRA_TITLE}<p>Astra</p>`,
  'one small dot on a dark page': `${ASTRA_TITLE}<body style="background: #111">
    <div style="width: 1px; height: 1px; background: #fff"></div></body>`,
};
const OTHER_APP_PAGE = '<!doctype html><title>Some other app</title><h1>Some other app</h1>';

function getAddStyleScript(css) {
  return `document.head.insertAdjacentHTML('beforeend', '<style>${css}</style>')`;
}

const BLANK_HOME_SCRIPTS = {
  'opacity 0 on its content': getAddStyleScript('main > * { opacity: 0 }'),
  'its content off screen': getAddStyleScript('main > * { position: absolute; left: -9999px }'),
  'nothing rendered 100 ms after the connected line': `setTimeout(() => document.querySelector('main').replaceChildren(), 100)`,
  'transparent text everywhere': getAddStyleScript('* { color: transparent !important }'),
  'a hidden main element': getAddStyleScript('main { display: none }'),
};
const PLAIN_HOME_SCRIPT = `document.querySelector('main').replaceChildren('Word')`;
const CLOSED_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:1/astra_closed_port';
const SIGNAL_ROUTES = {
  'to the verify process': {
    command: 'node',
    commandArgs: [CLI_PATH],
    detached: false,
    sendSignal: (child, signal) => child.kill(signal),
  },
  "to pnpm's whole process group": {
    command: 'pnpm',
    commandArgs: ['verify'],
    detached: true,
    sendSignal: (child, signal) => process.kill(-child.pid, signal),
  },
};

const scratchDir = mkdtempSync(join(tmpdir(), 'astra-verify-self-'));
const evidenceDir = join(scratchDir, 'evidence');
const runDir = join(scratchDir, 'run');
const runStatePath = join(runDir, 'run.json');
const devLogPath = join(runDir, 'dev.log');
const ports = { WEB_PORT: String(await getFreePort()), API_PORT: String(await getFreePort()) };

function runCli(args, extraEnv = {}) {
  const env = { ...process.env, ...ports, VERIFY_RUN_DIR: runDir, ...extraEnv };
  const options = { env, cwd: REPO_ROOT, timeout: CLI_TIMEOUT_MS };
  return new Promise((resolve) => {
    execFile('node', [CLI_PATH, ...args], options, (error, stdout, stderr) => {
      resolve({ exitCode: error ? error.code : 0, hung: Boolean(error?.killed), output: `${stdout}${stderr}` });
    });
  });
}

function assertFailed({ exitCode, hung = false, output }, expectedText) {
  assert.notEqual(exitCode, 0, `expected a failing exit code, got 0:\n${output}`);
  assert.equal(hung, false, `the command hung:\n${output}`);
  assert.match(output, expectedText);
}

function assertPassed({ exitCode, output }) {
  assert.equal(exitCode, 0, output);
}

function runCliAndSignalOnOutput({ route, args, expectedOutput, signal }) {
  const { command, commandArgs, detached, sendSignal } = route;
  const env = { ...process.env, ...ports, VERIFY_RUN_DIR: runDir };
  const child = spawn(command, [...commandArgs, ...args], { env, cwd: REPO_ROOT, detached });
  let output = '';
  let isSignalSent = false;
  const collectOutput = (data) => {
    output += data;
    if (isSignalSent || !output.includes(expectedOutput)) return;
    isSignalSent = true;
    sendSignal(child, signal);
  };
  child.stdout.on('data', collectOutput);
  child.stderr.on('data', collectOutput);
  return once(child, 'close').then(([exitCode]) => ({ exitCode, output }));
}

function getRecordedRun() {
  return JSON.parse(readFileSync(runStatePath, 'utf8'));
}

function getRealCommandPath(name) {
  return execFileSync('which', [name], { encoding: 'utf8' }).trim();
}

function installFakeCommand(name, script) {
  const binDir = mkdtempSync(join(scratchDir, 'bin-'));
  writeFileSync(join(binDir, name), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  return { PATH: `${binDir}:${process.env.PATH}` };
}

function getAppProcesses() {
  return execFileSync('ps', ['-A', '-o', 'command='], { encoding: 'utf8', maxBuffer: PROCESS_LIST_MAX_BYTES })
    .split('\n')
    .filter((command) => command.includes(APP_PROCESS_MARKER));
}

function assertNothingLeftRunning() {
  assert.deepEqual(getListenerProcessIds(ports.WEB_PORT), [], 'web port is free');
  assert.deepEqual(getListenerProcessIds(ports.API_PORT), [], 'API port is free');
  assert.deepEqual(getAppProcesses(), appProcessesBefore, 'no app process is left');
}

function assertImages({ present = [], absent = [] }) {
  for (const fileName of present) assert.equal(existsSync(join(evidenceDir, fileName)), true, `${fileName} exists`);
  for (const fileName of absent) assert.equal(existsSync(join(evidenceDir, fileName)), false, `${fileName} is gone`);
}

function plantImages(fileNames) {
  mkdirSync(evidenceDir, { recursive: true });
  for (const fileName of fileNames) writeFileSync(join(evidenceDir, fileName), 'an earlier image');
}

function assertScreenshotWidth(viewportName, fileName) {
  const { viewport, deviceScaleFactor } = VIEWPORTS[viewportName];
  const width = readFileSync(join(evidenceDir, fileName)).readUInt32BE(PNG_WIDTH_OFFSET);
  assert.equal(width, viewport.width * deviceScaleFactor, `${fileName} width`);
}

async function listenOnFreeLoopback(port) {
  for (const address of LOOPBACK_ADDRESSES) {
    const server = createServer((socket) => socket.destroy());
    const listening = await new Promise((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, address, () => resolve(true));
    });
    if (listening) return server;
  }
  throw new Error(`No free loopback address on port ${port}.`);
}

async function withForeignListener(port, action) {
  const server = await listenOnFreeLoopback(port);
  try {
    return await action();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function recordRun(fields) {
  writeFileSync(runStatePath, JSON.stringify({ webPort: UNUSED_PORT, apiPort: UNUSED_PORT, ...fields }));
}

function spawnShellGroup({ cwd, script, env = {} }) {
  const child = spawn('sh', ['-c', script], { cwd, env: { ...process.env, ...env }, detached: true, stdio: 'ignore' });
  child.unref();
  return child;
}

function recordProcessGroupAsRun({ cwd, script }) {
  const { pid } = spawnShellGroup({ cwd, script });
  recordRun({ processGroupId: pid, leaderStartTime: getProcessStartTime(pid) });
  return pid;
}

async function waitForLeaderExit(processGroupId) {
  const deadline = Date.now() + LEADER_EXIT_TIMEOUT_MS;
  while (getProcessStartTime(processGroupId) && Date.now() < deadline) await sleep(POLL_INTERVAL_MS);
  assert.equal(getProcessStartTime(processGroupId), '', 'the group leader exited');
}

async function assertBystanderSurvivesStop(bystander) {
  const stopResult = await runCli(['stop']);
  const survived = isProcessGroupAlive(bystander);
  if (survived) process.kill(-bystander, 'SIGKILL');
  assertPassed(stopResult);
  assert.equal(survived, true, 'the bystander survives');
}

const appProcessesBefore = getAppProcesses();

const SELF_CHECKS = [
  [
    'rejects a malformed port',
    async () => assertFailed(await runCli(['start'], { WEB_PORT: 'abc' }), /WEB_PORT must be a port/),
  ],
  [
    'drive refuses when nothing is running',
    async () => assertFailed(await runCli(['drive']), /not running/),
  ],
  [
    'start refuses a port held by another program on one address',
    async () => {
      const result = await withForeignListener(ports.WEB_PORT, () => runCli(['start']));
      assertFailed(result, new RegExp(`WEB_PORT ${ports.WEB_PORT} is taken`));
    },
  ],
  [
    'start waits until the web app and the API both answer',
    async () => {
      assertPassed(await runCli(['start'], { npm_config_reporter: 'silent', FORCE_COLOR: '1' }));
      const response = await fetch(`http://localhost:${ports.WEB_PORT}/api/health`);
      assert.deepEqual(await response.json(), { status: 'ok' });
      const devLog = readFileSync(devLogPath, 'utf8');
      assert.match(devLog, /apps\/web dev/, 'the dev log has output');
      assert.doesNotMatch(devLog, /proxy error/, 'a healthy start logs no proxy error');
    },
  ],
  [
    'start replaces the earlier run without stranding it',
    async () => assertPassed(await runCli(['start'])),
  ],
  [
    'doctor proves the instance, WebGL, audio, and the microphone',
    async () => {
      const result = await runCli(['doctor']);
      assertPassed(result);
      for (const name of ['identity', 'webgl', 'audio output', 'microphone']) {
        assert.match(result.output, new RegExp(`PASS ${name}:`));
      }
    },
  ],
  [
    'drive captures laptop and phone widths',
    async () => {
      assertPassed(await runCli(['drive', '--out', evidenceDir]));
      assertScreenshotWidth('laptop', 'home-laptop.png');
      assertScreenshotWidth('phone', 'home-phone.png');
    },
  ],
  [
    'a page that throws fails the run and saves a screenshot',
    async () => {
      const result = await runCli(driveFixture('page-throws'));
      assertFailed(result, /FAIL laptop page error: deliberate page failure/);
      assertScreenshotWidth('laptop', 'page-throws-laptop-failed.png');
    },
  ],
  [
    'a console error fails the run',
    async () =>
      assertFailed(await runCli(driveFixture('console-error')), /FAIL laptop console error: deliberate/),
  ],
  [
    'a journey that throws fails the run',
    async () =>
      assertFailed(await runCli(driveFixture('journey-gives-up')), /FAIL laptop journey: deliberate/),
  ],
  [
    'a page crash fails the run',
    async () => assertFailed(await runCli(driveFixture('page-crashes')), /Target crashed/),
  ],
  [
    'a page that is not Astra fails the run',
    async () => {
      const result = await runCli(driveFixture('served-page'), { SERVED_PAGE_HTML: OTHER_APP_PAGE });
      assertFailed(result, /FAIL laptop identity:.*Some other app/);
    },
  ],
  [
    'a throw and a console error just after the journey fail the run',
    async () => {
      const result = await runCli(driveFixture('late-throw'));
      assertFailed(result, /FAIL laptop page error: deliberate late page failure/);
      assert.match(result.output, /FAIL laptop console error: deliberate late console error/);
      assertImages({ present: ['late-throw-laptop-failed.png'], absent: ['late-throw-laptop.png'] });
    },
  ],
  [
    'a page crash just after the journey fails the run',
    async () => assertFailed(await runCli(driveFixture('late-crash')), /FAIL laptop page crash/),
  ],
  ...Object.entries(BLANK_PAGES).map(([kind, html]) => [
    `a blank page fails the run: ${kind}`,
    async () => {
      const result = await runCli(driveFixture('served-page'), { SERVED_PAGE_HTML: html });
      assertFailed(result, /FAIL laptop screenshot: every pixel is/);
    },
  ]),
  ...Object.entries(PLAIN_PAGES).map(([kind, html]) => [
    `a plain page passes: ${kind}`,
    async () => assertPassed(await runCli(driveFixture('served-page'), { SERVED_PAGE_HTML: html })),
  ]),
  ...Object.entries(BLANK_HOME_SCRIPTS).map(([kind, script]) => [
    `a blank Home inside the shell fails at both widths: ${kind}`,
    async () => {
      const result = await runCli(driveFixture('changed-home', BOTH_VIEWPORTS), { HOME_CHANGE_SCRIPT: script });
      assertFailed(result, /FAIL laptop main region/);
      assert.match(result.output, /FAIL phone main region/);
      assertImages({
        present: ['changed-home-laptop-failed.png', 'changed-home-phone-failed.png'],
        absent: ['changed-home-laptop.png', 'changed-home-phone.png'],
      });
    },
  ]),
  [
    'a plain Home inside the shell passes at both widths',
    async () => {
      const result = await runCli(driveFixture('changed-home', BOTH_VIEWPORTS), { HOME_CHANGE_SCRIPT: PLAIN_HOME_SCRIPT });
      assertPassed(result);
      assert.match(result.output, /PASS laptop main region: has more than one color/);
      assert.match(result.output, /PASS phone main region: has more than one color/);
      assertImages({ present: ['changed-home-laptop.png', 'changed-home-phone.png'] });
    },
  ],
  [
    'a rerun replaces the images of that journey and viewport',
    async () => {
      const passingPage = { SERVED_PAGE_HTML: PLAIN_PAGES['one word on white'] };
      const failingPage = { SERVED_PAGE_HTML: BLANK_PAGES['an empty body'] };
      assertPassed(await runCli(driveFixture('served-page'), passingPage));
      plantImages(['served-page-laptop-label.png', 'served-page-phone.png']);
      assertFailed(await runCli(driveFixture('served-page'), failingPage), /FAIL laptop screenshot/);
      assertImages({
        present: ['served-page-laptop-failed.png', 'served-page-phone.png'],
        absent: ['served-page-laptop.png', 'served-page-laptop-label.png'],
      });
      assertPassed(await runCli(driveFixture('served-page'), passingPage));
      assertImages({ present: ['served-page-laptop.png'], absent: ['served-page-laptop-failed.png'] });
    },
  ],
  [
    'a journey that closes its page fails the run',
    async () => assertFailed(await runCli(driveFixture('closes-page')), /FAIL laptop final page/),
  ],
  [
    'errors on a second page fail the run',
    async () => {
      const result = await runCli(driveFixture('second-page-error'));
      assertFailed(result, /FAIL laptop console error: deliberate second page console error/);
      assert.match(result.output, /FAIL laptop page error: deliberate second page failure/);
    },
  ],
  [
    'a journey that never settles fails at its deadline',
    async () =>
      assertFailed(await runCli(driveFixture('never-settles')), /FAIL laptop journey: The journey did not finish/),
  ],
  [
    'a journey with no default export fails and names the file',
    async () =>
      assertFailed(await runCli(driveFixture('no-default-export')), /no-default-export.mjs needs a default export/),
  ],
  [
    'doctor and drive fail while the latest API compile has errors',
    async () => {
      appendFileSync(devLogPath, 'apps/api dev: [1:00:00 AM] Found 2 errors. Watching for file changes.\n');
      assertFailed(await runCli(['doctor']), /FAIL api compile: the latest compile says "Found 2 errors"/);
      assertFailed(await runCli(['drive']), /api compile: the latest compile says "Found 2 errors"/);
      writeFileSync(devLogPath, '');
      assertFailed(await runCli(['doctor']), /FAIL api compile: no compile result/);
      appendFileSync(devLogPath, 'apps/api dev: [1:00:01 AM] Found 0 errors. Watching for file changes.\n');
      assert.match((await runCli(['doctor'])).output, /PASS api compile/);
    },
  ],
  [
    'drive refuses when another program also holds the web port',
    async () => {
      const result = await withForeignListener(ports.WEB_PORT, () => runCli(['drive']));
      assertFailed(result, /web port owner/);
    },
  ],
  [
    'doctor fails when the API dies',
    async () => {
      const [apiProcessId] = getListenerProcessIds(ports.API_PORT);
      assert.equal(getProcessGroupId(apiProcessId), getRecordedRun().processGroupId, 'the API port is this run\'s');
      process.kill(apiProcessId, 'SIGKILL');
      const result = await runCli(['doctor']);
      assertFailed(result, /FAIL api answers/);
      assert.match(result.output, /FAIL dev proxy reaches api/);
    },
  ],
  [
    'stop leaves no process and no port behind',
    async () => {
      const webProcessId = getListenerProcessIds(ports.WEB_PORT)[0];
      const processGroupId = getProcessGroupId(webProcessId);
      assertPassed(await runCli(['stop'], { TZ: 'Asia/Tokyo', LC_ALL: 'fr_FR.UTF-8' }));
      assert.equal(isProcessGroupAlive(processGroupId), false, 'process group is gone');
      assertNothingLeftRunning();
    },
  ],
  ['stop is safe to run twice', async () => assertPassed(await runCli(['stop']))],
  [
    'doctor fails when the ports answer with something else',
    async () => {
      let apiStatusCode = 500;
      const otherApp = createHttpServer((request, response) => response.end(OTHER_APP_PAGE));
      const api = createHttpServer((request, response) => {
        response.statusCode = apiStatusCode;
        response.end('{"status":"ok"}');
      });
      await once(otherApp.listen(ports.WEB_PORT), 'listening');
      await once(api.listen(ports.API_PORT), 'listening');
      const { pid } = spawnShellGroup({ cwd: REPO_ROOT, script: 'exit 0' });
      recordRun({ processGroupId: pid, webPort: ports.WEB_PORT, apiPort: ports.API_PORT });
      const brokenApiResult = await runCli(['doctor']);
      apiStatusCode = 200;
      const brokenProxyResult = await runCli(['doctor']);
      otherApp.close();
      api.close();
      assertFailed(brokenApiResult, /FAIL web answers/);
      assert.match(brokenApiResult.output, /FAIL api answers/);
      assert.match(brokenProxyResult.output, /PASS api answers/);
      assert.match(brokenProxyResult.output, /FAIL dev proxy reaches api/);
      assertPassed(await runCli(['stop']));
    },
  ],
  [
    'stop ignores a recorded group from a sibling checkout',
    async () => {
      const siblingDir = mkdtempSync(`${REPO_ROOT}-`);
      const bystander = recordProcessGroupAsRun({ cwd: siblingDir, script: 'sleep 60' });
      await assertBystanderSurvivesStop(bystander).finally(() => rmSync(siblingDir, { recursive: true }));
    },
  ],
  [
    'stop leaves a reused group ID alone inside the checkout',
    async () => {
      const { pid } = spawnShellGroup({ cwd: REPO_ROOT, script: 'sleep 60' });
      recordRun({ processGroupId: pid, leaderStartTime: 'Thu Jan  1 00:00:00 1970' });
      await assertBystanderSurvivesStop(pid);
    },
  ],
  [
    'stop leaves a group with no leader alone when it is from another run',
    async () => {
      const script = `${process.execPath} -e "setTimeout(() => {}, 60000)" & exit 0`;
      const leader = spawnShellGroup({ cwd: REPO_ROOT, script, env: { VERIFY_RUN_ID: 'another-run' } });
      recordRun({ processGroupId: leader.pid, runId: 'this-run' });
      await waitForLeaderExit(leader.pid);
      await assertBystanderSurvivesStop(leader.pid);
    },
  ],
  [
    'stop ends this run after a crash takes the group leader down',
    async () => {
      assertPassed(await runCli(['start']));
      const { processGroupId } = getRecordedRun();
      const [webProcessId] = getListenerProcessIds(ports.WEB_PORT);
      assert.equal(getProcessGroupId(webProcessId), processGroupId, 'the web port is this run\'s');
      process.kill(webProcessId, 'SIGKILL');
      await waitForLeaderExit(processGroupId);
      assertPassed(await runCli(['stop']));
      assert.equal(isProcessGroupAlive(processGroupId), false, 'process group is gone');
      assertNothingLeftRunning();
    },
  ],
  [
    'stop keeps its record when a port read fails',
    async () => {
      assertPassed(await runCli(['start']));
      const realLsof = getRealCommandPath('lsof');
      const failingPortRead = installFakeCommand(
        'lsof',
        `case "$*" in *-iTCP*) echo "lsof: deliberate failure" >&2; exit 1;; esac\nexec ${realLsof} "$@"`,
      );
      assertFailed(await runCli(['stop'], failingPortRead), /deliberate failure/);
      assert.equal(existsSync(runStatePath), true, 'the record stays');
      assertPassed(await runCli(['stop']));
      assert.equal(existsSync(runStatePath), false, 'the record is gone once ports read free');
      assertNothingLeftRunning();
    },
  ],
  [
    'stop keeps its record while a port is still held',
    async () => {
      const { pid } = spawnShellGroup({ cwd: REPO_ROOT, script: 'exit 0' });
      recordRun({ processGroupId: pid, webPort: ports.WEB_PORT });
      const result = await withForeignListener(ports.WEB_PORT, () => runCli(['stop']));
      assertFailed(result, /Still listening after stop/);
      assert.equal(existsSync(runStatePath), true, 'the record stays');
      assertPassed(await runCli(['stop']));
      assert.equal(existsSync(runStatePath), false, 'the record is gone once the port is free');
    },
  ],
  [
    'stop force-kills a group that ignores SIGTERM',
    async () => {
      const stubborn = recordProcessGroupAsRun({ cwd: REPO_ROOT, script: 'trap "" TERM; sleep 60' });
      assertPassed(await runCli(['stop']));
      assert.equal(isProcessGroupAlive(stubborn), false, 'the group is gone');
    },
  ],
  [
    'a refused drive leaves no earlier pass image',
    async () => {
      plantImages(['home-laptop.png']);
      assertFailed(await runCli(['drive', '--viewports', 'laptop', '--out', evidenceDir]), /not running/);
      assertImages({ absent: ['home-laptop.png'] });
      plantImages(['home-laptop.png']);
      const typoRun = await runCli(['run', '--viewports', 'laptop,tablet', '--out', evidenceDir]);
      assertFailed(typoRun, /Unknown viewport tablet/);
      assertImages({ absent: ['home-laptop.png'] });
    },
  ],
  [
    'run reports a missing await and stops the app',
    async () => {
      const result = await runCli(['run', ...driveFixture('missing-await').slice(1)]);
      assertFailed(result, /FAIL stray error, usually a missing await/);
      assertImages({ present: ['missing-await-laptop-failed.png'], absent: ['missing-await-laptop.png'] });
      assertNothingLeftRunning();
    },
  ],
  ...Object.entries(SIGNAL_ROUTES).flatMap(([routeName, route]) =>
    ['SIGINT', 'SIGTERM'].map((signal) => [
      `run reports ${signal} sent ${routeName} and stops the app`,
      async () => {
        const args = ['run', ...driveFixture('waits-for-signal').slice(1)];
        const result = await runCliAndSignalOnOutput({ route, args, expectedOutput: 'the journey is waiting', signal });
        assertFailed(result, new RegExp(`FAIL interrupted by ${signal}`));
        assert.equal(result.exitCode, 1, 'verify.mjs, not Playwright, chose the exit code');
        assert.equal(existsSync(runStatePath), false, 'the record is gone');
        assertNothingLeftRunning();
      },
    ]),
  ),
  [
    'start shows the API error when the app does not start',
    async () => {
      const failingDevCommand = installFakeCommand(
        'pnpm',
        `case "$1" in dev) echo "Error: deliberate API boot failure"; exit 1;; esac\nexec ${getRealCommandPath('pnpm')} "$@"`,
      );
      assertFailed(await runCli(['start'], failingDevCommand), /Error: deliberate API boot failure/);
    },
  ],
  [
    'start shows a migrate failure and starts nothing',
    async () => {
      const result = await runCli(['start'], { DATABASE_URL: CLOSED_DATABASE_URL, npm_config_reporter: 'silent' });
      assertFailed(result, /pnpm db:migrate failed[\s\S]*ECONNREFUSED/);
      assert.doesNotMatch(result.output, /App not ready/, 'it does not wait for the app');
      assert.equal(existsSync(runStatePath), false, 'no app was started');
      assertNothingLeftRunning();
    },
  ],
];

function driveFixture(name, viewports = 'laptop') {
  const journey = join(FIXTURES_DIR, `${name}.mjs`);
  return ['drive', '--journey', journey, '--viewports', viewports, '--out', evidenceDir];
}

async function main() {
  let failedCount = 0;
  for (const [name, check] of SELF_CHECKS) {
    const startedAt = Date.now();
    try {
      await check();
      console.log(`PASS ${name} (${Date.now() - startedAt} ms)`);
    } catch (error) {
      failedCount += 1;
      console.log(`FAIL ${name}\n${error.message}`);
    }
  }
  await runCli(['stop']);
  rmSync(scratchDir, { recursive: true, force: true });
  console.log(failedCount === 0 ? 'PASSED' : `FAILED ${failedCount} of ${SELF_CHECKS.length} self checks`);
  process.exitCode = failedCount === 0 ? 0 : 1;
}

await main();
