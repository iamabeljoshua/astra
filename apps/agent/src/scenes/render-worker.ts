import { type ChildProcess, spawn } from 'node:child_process';
import type { DeclaredValue, SceneTheme } from './scene-types.ts';

export const WORKER_IMAGE = 'astra-scene-worker:manimgx-0.1.1';
const MOST_WHOLE_JOB_MS = 90_000;
const MOST_STEP_SECONDS = 45;
/** 2 of 65 test takes passed this, and one reached 17.7 MB. A take this large would stall a laptop on a slow line. */
export const MOST_TAKE_BYTES = 6 * 1024 * 1024;
const MOST_SHEET_BYTES = 4 * 1024 * 1024;
const MOST_HEADER_BYTES = 256 * 1024;
const MOST_ERROR_NOTE_CHARACTERS = 600;
const HEADER_LENGTH_BYTES = 4;

export interface RenderJob {
  code: string;
  moments: Readonly<Record<string, number>>;
  durationSeconds: number;
  themes: readonly SceneTheme[];
  values: Readonly<Record<string, number>>;
  /** Times for the pictures the reviewer sees. Empty makes takes only. */
  inspectSeconds: readonly number[];
}

export interface MadeTake {
  theme: SceneTheme;
  bytes: Buffer;
  makeMs: number;
  seconds: number;
  parts: readonly string[];
}

export type RenderResult =
  | { isOk: false; stage: 'gate' | 'make' | 'inspect' | 'time' | 'size' | 'worker'; reasons: readonly string[]; ms: number }
  | { isOk: true; takes: readonly MadeTake[]; sheets: readonly Buffer[]; layoutProblems: readonly string[]; layoutNotes: readonly string[]; declared: Readonly<Record<string, DeclaredValue>>; ms: number };

export type RenderWorker = (job: RenderJob, signal: AbortSignal) => Promise<RenderResult>;

export interface WorkerRecord {
  header: { kind: string; bytes: number; [field: string]: unknown };
  payload: Buffer;
}

/** The wall a scene runs behind. The AST gate inside is only a first line. */
export function getContainerArguments(name: string, image = WORKER_IMAGE): string[] {
  return ['run', '--rm', '-i', '--name', name, '--network', 'none', '--memory=512m', '--memory-swap=512m', '--cpus=2', '--pids-limit=64', '--read-only', '--tmpfs', '/tmp:size=64m', '--cap-drop=ALL', '--security-opt', 'no-new-privileges', '--env', 'HOME=/tmp', image];
}

const getPayloadLimit = (kind: unknown) => (kind === 'take' ? MOST_TAKE_BYTES : kind === 'sheet' ? MOST_SHEET_BYTES : 0);

// Reads the worker's framed records as they arrive. A scene can write to its stdout too, so every length is checked before anything is kept.
export function createRecordReader(onRecord: (record: WorkerRecord) => void, onRefused: (reason: string) => void) {
  let buffered = Buffer.alloc(0);
  let isRefused = false;
  const refuse = (reason: string) => {
    isRefused = true;
    buffered = Buffer.alloc(0);
    onRefused(reason);
  };
  const readOne = (): boolean => {
    if (buffered.length < HEADER_LENGTH_BYTES) return false;
    const headerLength = buffered.readUInt32BE(0);
    if (headerLength > MOST_HEADER_BYTES) {
      refuse('a record header is too long');
      return false;
    }
    if (buffered.length < HEADER_LENGTH_BYTES + headerLength) return false;
    const header = JSON.parse(buffered.subarray(HEADER_LENGTH_BYTES, HEADER_LENGTH_BYTES + headerLength).toString()) as WorkerRecord['header'];
    const payloadLength = header.bytes;
    if (!Number.isSafeInteger(payloadLength) || payloadLength < 0 || payloadLength > getPayloadLimit(header.kind)) {
      refuse(header.kind === 'take' ? `the take passed ${MOST_TAKE_BYTES} bytes` : `a ${String(header.kind)} record is too large`);
      return false;
    }
    const end = HEADER_LENGTH_BYTES + headerLength + payloadLength;
    if (buffered.length < end) return false;
    onRecord({ header, payload: Buffer.from(buffered.subarray(HEADER_LENGTH_BYTES + headerLength, end)) });
    buffered = buffered.subarray(end);
    return true;
  };
  return (chunk: Buffer) => {
    if (isRefused) return;
    buffered = Buffer.concat([buffered, chunk]);
    try {
      while (!isRefused && readOne());
    } catch {
      refuse('a record could not be read');
    }
  };
}

interface Collected {
  takes: MadeTake[];
  sheets: Buffer[];
  layoutProblems: string[];
  layoutNotes: string[];
  declared: Readonly<Record<string, DeclaredValue>>;
  failure: { stage: 'gate' | 'make' | 'inspect' | 'time' | 'size' | 'worker'; reasons: readonly string[] } | null;
  isDone: boolean;
}

function collectRecord(collected: Collected, { header, payload }: WorkerRecord): void {
  switch (header.kind) {
    case 'gate':
      collected.declared = (header.declared ?? {}) as Collected['declared'];
      if (header.ok !== true) collected.failure = { stage: 'gate', reasons: header.reasons as string[] };
      return;
    case 'take': {
      const made = header.made as { makeMs: number; seconds: number; parts: string[] };
      collected.takes.push({ theme: header.theme as SceneTheme, bytes: payload, makeMs: made.makeMs, seconds: made.seconds, parts: made.parts });
      return;
    }
    case 'layout':
      collected.layoutProblems = header.problems as string[];
      collected.layoutNotes = header.notes as string[];
      return;
    case 'sheet':
      collected.sheets.push(payload);
      return;
    case 'failed':
      collected.failure = { stage: header.stage as 'make', reasons: header.reasons as string[] };
      return;
    case 'done':
      collected.isDone = true;
  }
}

const removeContainer = (name: string) => spawn('docker', ['rm', '-f', name], { stdio: 'ignore' });

function startContainer(name: string, image: string, job: RenderJob): ChildProcess {
  const child = spawn('docker', getContainerArguments(name, image), { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin?.end(JSON.stringify({ ...job, stepLimitSeconds: MOST_STEP_SECONDS }));
  return child;
}

// One short-lived container per job, removed when it ends, so nothing outlives a scene.
export function createContainerWorker({ image = WORKER_IMAGE, limitMs = MOST_WHOLE_JOB_MS, namePrefix = 'astra-scene' }: { image?: string; limitMs?: number; namePrefix?: string } = {}): RenderWorker {
  let jobCount = 0;
  return (job, signal) =>
    new Promise((resolve) => {
      const startedAt = performance.now();
      const name = `${namePrefix}-${process.pid}-${(jobCount += 1)}`;
      const collected: Collected = { takes: [], sheets: [], layoutProblems: [], layoutNotes: [], declared: {}, failure: null, isDone: false };
      const child = startContainer(name, image, job);
      let errorNote = '';
      const stopWith = (stage: 'time' | 'size' | 'worker', reason: string) => {
        collected.failure ??= { stage, reasons: [reason] };
        removeContainer(name);
      };
      const timer = setTimeout(() => stopWith('time', `the scene passed ${limitMs} ms`), limitMs);
      const onAbort = () => stopWith('time', 'the scene is no longer wanted');
      signal.addEventListener('abort', onAbort, { once: true });
      const read = createRecordReader((record) => collectRecord(collected, record), (reason) => stopWith(reason.includes('take') ? 'size' : 'worker', reason));
      child.stdout?.on('data', read);
      child.stderr?.on('data', (chunk: Buffer) => {
        errorNote = (errorNote + chunk.toString()).slice(-MOST_ERROR_NOTE_CHARACTERS);
      });
      child.on('close', () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        const ms = performance.now() - startedAt;
        if (collected.failure) resolve({ isOk: false, ...collected.failure, ms });
        else if (!collected.isDone) resolve({ isOk: false, stage: 'worker', reasons: [`the worker stopped early: ${errorNote}`], ms });
        else resolve({ isOk: true, takes: collected.takes, sheets: collected.sheets, layoutProblems: collected.layoutProblems, layoutNotes: collected.layoutNotes, declared: collected.declared, ms });
      });
    });
}
