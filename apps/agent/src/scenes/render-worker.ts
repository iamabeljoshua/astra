import { type ChildProcess, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { DeclaredValue, SceneTheme } from './scene-types.ts';
import { createRecordCollector, createRecordReader, type FailureStage, getRecordLimits, type MadeTake, MOST_TAKE_BYTES, type TakeSheet } from './worker-records.ts';

export const WORKER_IMAGE = 'astra-scene-worker:manimgx-0.1.1-uid2';
const SECCOMP_PROFILE = resolve(import.meta.dirname, '../../../scene-worker/seccomp.json');
const MOST_WHOLE_JOB_MS = 90_000;
const MOST_STEP_SECONDS = 45;
const MOST_ERROR_NOTE_CHARACTERS = 600;
const MS_PER_SECOND = 1000;

export interface RenderJob {
  code: string;
  moments: Readonly<Record<string, number>>;
  durationSeconds: number;
  themes: readonly SceneTheme[];
  values: Readonly<Record<string, number>>;
  inspectSeconds?: readonly number[];
}

export type RenderResult =
  | { isOk: false; stage: FailureStage; reasons: readonly string[]; ms: number }
  | { isOk: true; takes: readonly MadeTake[]; sheets: readonly TakeSheet[]; layoutProblems: readonly string[]; layoutNotes: readonly string[]; declared: Readonly<Record<string, DeclaredValue>>; ms: number };

export type RenderWorker = (job: RenderJob, signal: AbortSignal) => Promise<RenderResult>;

// The job starts as root holding only the rights to step down, so it can run model-written code under a uid that cannot open its descriptors. No logging driver, so nothing a job prints reaches a disk. The scene's own folder must allow executable mappings, because Mesa's software renderer needs them for its compiled shaders.
export function getContainerArguments(name: string, image = WORKER_IMAGE): string[] {
  return ['run', '--rm', '-i', '--name', name, '--network', 'none', '--log-driver', 'none', '--memory=512m', '--memory-swap=512m', '--cpus=2', '--pids-limit=64', '--read-only', '--ipc', 'none', '--ulimit', 'core=0', '--tmpfs', '/tmp:size=16m,mode=0755,noexec,nosuid,nodev', '--tmpfs', '/scene:size=64m,uid=1000,gid=1000,mode=0755,nosuid,nodev', '--cap-drop=ALL', '--cap-add=SETUID', '--cap-add=SETGID', '--security-opt', 'no-new-privileges', '--security-opt', `seccomp=${SECCOMP_PROFILE}`, '--env', 'HOME=/scene', image];
}

const removeContainer = (name: string) => spawn('docker', ['rm', '-f', name], { stdio: 'ignore' });

function startContainer(name: string, image: string, job: RenderJob, limitMs: number): ChildProcess {
  const child = spawn('docker', getContainerArguments(name, image), { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin?.end(JSON.stringify({ ...job, stepLimitSeconds: MOST_STEP_SECONDS, wholeLimitSeconds: Math.ceil(limitMs / MS_PER_SECOND), mostTakeBytes: MOST_TAKE_BYTES }));
  return child;
}

export function createContainerWorker({ image = WORKER_IMAGE, limitMs = MOST_WHOLE_JOB_MS, namePrefix = 'astra-scene' }: { image?: string; limitMs?: number; namePrefix?: string } = {}): RenderWorker {
  let jobCount = 0;
  return (job, signal) =>
    new Promise((resolveResult) => {
      const startedAt = performance.now();
      const name = `${namePrefix}-${process.pid}-${(jobCount += 1)}`;
      const collector = createRecordCollector(job.themes);
      const { collected } = collector;
      const child = startContainer(name, image, job, limitMs);
      let errorNote = '';
      const stopWith = (stage: FailureStage, reason: string) => {
        collected.failure = { stage, reasons: [reason] };
        removeContainer(name);
      };
      const timer = setTimeout(() => stopWith('time', `the scene passed ${limitMs} ms`), limitMs);
      const onAbort = () => stopWith('time', 'the scene is no longer wanted');
      signal.addEventListener('abort', onAbort, { once: true });
      child.on('error', (error) => {
        collected.failure ??= { stage: 'worker', reasons: [`the worker could not start: ${error.message}`] };
      });
      child.stdin?.on('error', () => {});
      child.stdout?.on('data', createRecordReader((record) => collector.accept(record), (reason, stage) => stopWith(stage, reason), getRecordLimits(job.themes.length)));
      child.stderr?.on('data', (chunk: Buffer) => {
        errorNote = (errorNote + chunk.toString()).slice(-MOST_ERROR_NOTE_CHARACTERS);
      });
      child.on('close', () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        const ms = performance.now() - startedAt;
        const missingTheme = collector.getMissingTheme();
        if (collected.failure) resolveResult({ isOk: false, ...collected.failure, ms });
        else if (!collected.isDone) resolveResult({ isOk: false, stage: 'worker', reasons: [`the worker stopped early: ${errorNote}`], ms });
        else if (missingTheme) resolveResult({ isOk: false, stage: 'worker', reasons: [`the worker made no ${missingTheme} take`], ms });
        else resolveResult({ isOk: true, takes: collected.takes, sheets: collected.sheets, layoutProblems: collected.layoutProblems, layoutNotes: collected.layoutNotes, declared: collected.declared, ms });
      });
    });
}
