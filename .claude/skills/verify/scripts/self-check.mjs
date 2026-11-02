#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getFreePort,
  getListenerProcessIds,
  getProcessGroupId,
  isProcessGroupAlive,
} from './lib/processes.mjs';
import { REPO_ROOT, SKILL_ROOT, VIEWPORTS } from './lib/settings.mjs';

const CLI_PATH = join(SKILL_ROOT, 'scripts/verify.mjs');
const FIXTURES_DIR = join(SKILL_ROOT, 'scripts/fixtures');
const APP_PROCESS_MARKER = join(REPO_ROOT, 'apps');
const PNG_WIDTH_OFFSET = 16;
const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1'];

const scratchDir = mkdtempSync(join(tmpdir(), 'astra-verify-self-'));
const evidenceDir = join(scratchDir, 'evidence');
const runDir = join(scratchDir, 'run');
const ports = { WEB_PORT: String(await getFreePort()), API_PORT: String(await getFreePort()) };

function runCli(args, extraEnv = {}) {
  const env = { ...process.env, ...ports, VERIFY_RUN_DIR: runDir, ...extraEnv };
  return new Promise((resolve) => {
    execFile('node', [CLI_PATH, ...args], { env, cwd: REPO_ROOT }, (error, stdout, stderr) => {
      resolve({ exitCode: error ? error.code : 0, output: `${stdout}${stderr}` });
    });
  });
}

function assertFailed({ exitCode, output }, expectedText) {
  assert.notEqual(exitCode, 0, `expected a failing exit code, got 0:\n${output}`);
  assert.match(output, expectedText);
}

function assertPassed({ exitCode, output }) {
  assert.equal(exitCode, 0, output);
}

function getAppProcesses() {
  return execFileSync('ps', ['-A', '-o', 'command='], { encoding: 'utf8', maxBuffer: 2 ** 26 })
    .split('\n')
    .filter((command) => command.includes(APP_PROCESS_MARKER));
}

function assertScreenshotWidth(viewportName, fileName) {
  const { viewport, deviceScaleFactor } = VIEWPORTS[viewportName];
  const width = readFileSync(join(evidenceDir, fileName)).readUInt32BE(PNG_WIDTH_OFFSET);
  assert.equal(width, viewport.width * deviceScaleFactor, `${fileName} width`);
}

async function listenOnFreeLoopback(port) {
  for (const address of LOOPBACK_ADDRESSES) {
    const server = createServer();
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
      assertPassed(await runCli(['start']));
      const response = await fetch(`http://localhost:${ports.WEB_PORT}/api/health`);
      assert.deepEqual(await response.json(), { status: 'ok' });
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
    'a page that is not Astra fails the run',
    async () => assertFailed(await runCli(driveFixture('other-app')), /FAIL laptop identity:.*Some other app/),
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
      assertPassed(await runCli(['stop']));
      assert.equal(isProcessGroupAlive(processGroupId), false, 'process group is gone');
      assert.deepEqual(getListenerProcessIds(ports.WEB_PORT), [], 'web port is free');
      assert.deepEqual(getListenerProcessIds(ports.API_PORT), [], 'API port is free');
      assert.deepEqual(getAppProcesses(), appProcessesBefore, 'no app process is left');
    },
  ],
  ['stop is safe to run twice', async () => assertPassed(await runCli(['stop']))],
  [
    'stop ignores a recorded group that is not from this checkout',
    async () => {
      const bystander = spawn('sleep', ['60'], { cwd: scratchDir, detached: true, stdio: 'ignore' });
      bystander.unref();
      const run = { processGroupId: bystander.pid, webPort: 1, apiPort: 1, logPath: '' };
      writeFileSync(join(runDir, 'run.json'), JSON.stringify(run));
      assertPassed(await runCli(['stop']));
      assert.equal(isProcessGroupAlive(bystander.pid), true, 'the bystander survives');
      process.kill(-bystander.pid, 'SIGKILL');
    },
  ],
];

function driveFixture(name) {
  const journey = join(FIXTURES_DIR, `${name}.mjs`);
  return ['drive', '--journey', journey, '--viewports', 'laptop', '--out', evidenceDir];
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
