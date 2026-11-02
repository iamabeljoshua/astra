import { execFileSync, spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { createServer } from 'node:net';

const LSOF_NO_MATCH_EXIT_CODE = 1;

function readCommandOutput(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (error) {
    if (error.status === LSOF_NO_MATCH_EXIT_CODE) return '';
    throw error;
  }
}

function getOutputLines(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

// The child leads a new process group, so one signal reaches pnpm, Vite, Nest, and the API.
export function spawnProcessGroup({ command, args, cwd, env, logPath }) {
  const logFile = openSync(logPath, 'w');
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', logFile, logFile] });
  child.unref();
  closeSync(logFile);
  return child.pid;
}

export function isProcessGroupAlive(processGroupId) {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch {
    return false;
  }
}

export function signalProcessGroup(processGroupId, signal) {
  process.kill(-processGroupId, signal);
}

// A saved group id can be reused after a reboot, so only signal a group working in this checkout.
export function isProcessGroupInDirectory(processGroupId, directory) {
  const lines = getOutputLines(
    readCommandOutput('lsof', ['-a', '-d', 'cwd', '-g', String(processGroupId), '-Fn']),
  );
  return lines.some((line) => line.startsWith(`n${directory}`));
}

export function getListenerProcessIds(port) {
  const output = readCommandOutput('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  return getOutputLines(output).map(Number);
}

export function getProcessGroupId(processId) {
  return Number(readCommandOutput('ps', ['-o', 'pgid=', '-p', String(processId)]).trim());
}

export function getProcessCommand(processId) {
  return readCommandOutput('ps', ['-o', 'command=', '-p', String(processId)]).trim();
}

export async function getFreePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}
