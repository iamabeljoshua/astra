import { type ChildProcess, spawn } from 'node:child_process';

// macOS cannot tie a child's life to its parent's, so a small shell watches a pipe that closes when this process ends, however it ends.
const TIED_SHELL = '"$@" </dev/null >/dev/null 2>&1 & running=$!; cat >/dev/null; kill -9 "$running" 2>/dev/null';

export function startTiedChild(command: string, args: readonly string[]): ChildProcess {
  return spawn('sh', ['-c', TIED_SHELL, 'tied-child', command, ...args], { stdio: ['pipe', 'ignore', 'ignore'] });
}

// A fault in one lesson's callback must not end every other lesson in this process.
export function installCrashGuards(onFailure: (name: string, error: unknown) => void): void {
  process.on('uncaughtException', (error) => onFailure('uncaught', error));
  process.on('unhandledRejection', (error) => onFailure('uncaught', error));
}
