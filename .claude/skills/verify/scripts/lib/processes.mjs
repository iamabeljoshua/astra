import { execFileSync, spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { createServer } from 'node:net';

const NO_MATCH_EXIT_CODE = 1;
export const PROCESS_LIST_MAX_BYTES = 64 * 1024 * 1024;
// ps prints a start time in local time and the current locale, so pin both to compare it across shells.
const COMMAND_ENV = { ...process.env, LC_ALL: 'C', TZ: 'UTC' };

// lsof and ps exit 1 with an empty stderr when nothing matches. Anything else is not an answer.
function readCommandOutput(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      env: COMMAND_ENV,
      maxBuffer: PROCESS_LIST_MAX_BYTES,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (error.status === NO_MATCH_EXIT_CODE && !error.stderr) return '';
    throw new Error(`${command} ${args.join(' ')} failed: ${error.stderr || error.message}`);
  }
}

function getOutputLines(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

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

export function isProcessGroupInDirectory(processGroupId, directory) {
  const lines = getOutputLines(
    readCommandOutput('lsof', ['-w', '-a', '-d', 'cwd', '-g', String(processGroupId), '-Fn']),
  );
  return lines.some((line) => line === `n${directory}` || line.startsWith(`n${directory}/`));
}

export function isProcessGroupCarrying({ processGroupId, environmentEntry }) {
  const lines = getOutputLines(readCommandOutput('ps', ['eww', '-A', '-o', 'pgid=,command=']));
  return lines.some((line) => line.startsWith(`${processGroupId} `) && line.includes(environmentEntry));
}

export function getListenerProcessIds(port) {
  const output = readCommandOutput('lsof', ['-w', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  return getOutputLines(output).map(Number);
}

export function getProcessStartTime(processId) {
  return readCommandOutput('ps', ['-o', 'lstart=', '-p', String(processId)]).trim();
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
