import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContainerWorker, getContainerArguments, type RenderJob } from '../src/scenes/render-worker.ts';
import { createRecordReader, MOST_TAKE_BYTES, type WorkerRecord } from '../src/scenes/worker-records.ts';

const WORKER_FOLDER = resolve(import.meta.dirname, '../../scene-worker');

function frame(header: object, payload = Buffer.alloc(0)): Buffer {
  const head = Buffer.from(JSON.stringify({ ...header, bytes: payload.length }));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(head.length);
  return Buffer.concat([length, head, payload]);
}

function read(...chunks: Buffer[]) {
  const records: WorkerRecord[] = [];
  const refused: string[] = [];
  const reader = createRecordReader((record) => records.push(record), (reason) => refused.push(reason));
  chunks.forEach(reader);
  return { records, refused };
}

describe('the container a scene runs in', () => {
  it('has no network, a read-only disk, 2 CPUs, 512 MB, and no way to gain rights', () => {
    const args = getContainerArguments('astra-scene-1');
    for (const flag of ['--read-only', '--cap-drop=ALL', '--cpus=2', '--memory=512m', '--memory-swap=512m', '--pids-limit=64', '--rm']) expect(args).toContain(flag);
    expect(args.slice(args.indexOf('--network'), args.indexOf('--network') + 2)).toEqual(['--network', 'none']);
    expect(args.slice(args.indexOf('--security-opt'), args.indexOf('--security-opt') + 2)).toEqual(['--security-opt', 'no-new-privileges']);
  });
});

describe('the pins on what a scene runs on', () => {
  it('runs no logging driver, so a flood of output cannot reach the disk', () => {
    const args = getContainerArguments('astra-scene-1');
    expect(args.slice(args.indexOf('--log-driver'), args.indexOf('--log-driver') + 2)).toEqual(['--log-driver', 'none']);
  });

  it('pins a seccomp profile, because a daemon set to unconfined would give hostile code a user namespace', () => {
    const args = getContainerArguments('astra-scene-1');
    const pinned = args.find((arg) => arg.startsWith('seccomp='));
    expect(pinned).toBeDefined();
    const profile = JSON.parse(readFileSync((pinned as string).slice('seccomp='.length), 'utf8')) as { defaultAction: string; syscalls: { names: string[]; action: string; args?: unknown[] }[] };
    expect(profile.defaultAction).toBe('SCMP_ACT_ERRNO');
    const allowedOutright = profile.syscalls.filter(({ action, args: rules }) => action === 'SCMP_ACT_ALLOW' && !rules?.length).flatMap(({ names }) => names);
    for (const name of ['unshare', 'setns', 'mount', 'ptrace', 'bpf', 'clone', 'clone3', 'socket', 'memfd_create', 'process_vm_writev', 'io_uring_setup', 'userfaultfd', 'perf_event_open', 'keyctl']) expect(allowedOutright).not.toContain(name);
  });

  it('gives the worker only the rights it needs to step down to the scene user', () => {
    const args = getContainerArguments('astra-scene-1');
    expect(args.filter((arg) => arg.startsWith('--cap-add'))).toEqual(['--cap-add=SETUID', '--cap-add=SETGID']);
  });

  it('pins the base image by digest and every wheel by hash', () => {
    const dockerfile = readFileSync(join(WORKER_FOLDER, 'Dockerfile'), 'utf8');
    expect(dockerfile).toMatch(/^FROM python:3\.14-slim@sha256:[0-9a-f]{64}$/m);
    expect(dockerfile).toContain('--require-hashes');
    const requirements = readFileSync(join(WORKER_FOLDER, 'requirements.lock'), 'utf8').split(/\n(?=\S)/).filter((entry) => entry.trim() !== '');
    expect(requirements.length).toBeGreaterThan(10);
    for (const requirement of requirements) expect(requirement).toMatch(/^\S+==\S+[\s\\]+--hash=sha256:[0-9a-f]{64}/);
  });
});

const JOB: RenderJob = { code: 'class Lesson: pass', moments: { a: 1 }, durationSeconds: 4, themes: ['light', 'dark'], values: {}, inspectSeconds: [1] };
const realPath = process.env.PATH;

function runOnFakeDocker(records: Buffer) {
  const folder = mkdtempSync(join(tmpdir(), 'fake-docker-'));
  writeFileSync(join(folder, 'records.bin'), records);
  writeFileSync(join(folder, 'docker'), `#!/bin/sh\n[ "$1" = run ] && cat "${join(folder, 'records.bin')}"\nexit 0\n`);
  chmodSync(join(folder, 'docker'), 0o755);
  process.env.PATH = `${folder}:${realPath}`;
  return createContainerWorker({ limitMs: 20_000 })(JOB, new AbortController().signal);
}

const MADE = { makeMs: 1, seconds: 4, parts: ['a'] };
const GATE = frame({ kind: 'gate', ok: true, reasons: [], declared: {} });
const LAYOUT = frame({ kind: 'layout', problems: [], notes: [] });
const DONE = frame({ kind: 'done' });
const take = (theme: string, bytes = Buffer.from('take')) => frame({ kind: 'take', theme, made: MADE }, bytes);
const sheet = (theme: string) => frame({ kind: 'sheet', theme, index: 0 }, Buffer.from('png'));
const GOOD = [GATE, take('light'), take('dark'), LAYOUT, sheet('light'), LAYOUT, sheet('dark'), DONE];

describe('what a job may send back', () => {
  afterEach(() => {
    process.env.PATH = realPath;
  });

  it('takes a good run, with a take and a sheet per theme', async () => {
    const result = await runOnFakeDocker(Buffer.concat(GOOD));
    expect(result.isOk).toBe(true);
    if (result.isOk) expect(result.takes.map(({ theme }) => theme)).toEqual(['light', 'dark']);
  });

  it.each(['../../../outside/escaped', '../other-scene/light', 'sepia', ''])('refuses a take with the theme %j', async (theme) => {
    expect((await runOnFakeDocker(Buffer.concat([GATE, take(theme), take('light'), take('dark'), LAYOUT, sheet('light'), LAYOUT, sheet('dark'), DONE]))).isOk).toBe(false);
  });

  it('refuses a second take for one theme', async () => {
    expect((await runOnFakeDocker(Buffer.concat([GATE, take('light'), take('light'), take('dark'), LAYOUT, sheet('light'), LAYOUT, sheet('dark'), DONE]))).isOk).toBe(false);
  });

  it('refuses a run with a take missing for a theme it asked for', async () => {
    expect((await runOnFakeDocker(Buffer.concat([GATE, take('light'), LAYOUT, sheet('light'), LAYOUT, sheet('dark'), DONE]))).isOk).toBe(false);
  });

  it('refuses more records than a job can make, as 101 takes did', async () => {
    const flood = Array.from({ length: 101 }, () => take('light', Buffer.alloc(1024)));
    expect((await runOnFakeDocker(Buffer.concat([GATE, ...flood, DONE]))).isOk).toBe(false);
  });

  it('refuses more bytes in all than a job can make', async () => {
    const sheets = Array.from({ length: 40 }, () => frame({ kind: 'sheet', theme: 'light', index: 0 }, Buffer.alloc(3 * 1024 * 1024)));
    expect((await runOnFakeDocker(Buffer.concat([GATE, take('light'), take('dark'), ...sheets, DONE]))).isOk).toBe(false);
  });

  it('refuses a picture or a take with no bytes, because nobody can review nothing', async () => {
    expect((await runOnFakeDocker(Buffer.concat([GATE, take('light'), take('dark'), LAYOUT, frame({ kind: 'sheet', theme: 'light', index: 0 }), sheet('dark'), DONE]))).isOk).toBe(false);
    expect((await runOnFakeDocker(Buffer.concat([GATE, take('light', Buffer.alloc(0)), take('dark'), LAYOUT, sheet('light'), sheet('dark'), DONE]))).isOk).toBe(false);
  });

  it('refuses a record after the last one, and a take with fields of the wrong kind', async () => {
    expect((await runOnFakeDocker(Buffer.concat([...GOOD, take('light')]))).isOk).toBe(false);
    expect((await runOnFakeDocker(Buffer.concat([GATE, frame({ kind: 'take', theme: 'light', made: { seconds: 'soon', parts: 'all' } }, Buffer.from('t')), take('dark'), LAYOUT, sheet('light'), LAYOUT, sheet('dark'), DONE]))).isOk).toBe(false);
  });
});

describe('reading what the worker sends', () => {
  it('reads records split across any chunks', () => {
    const whole = Buffer.concat([frame({ kind: 'gate', ok: true }), frame({ kind: 'take', theme: 'light' }, Buffer.from('take-bytes'))]);
    const { records, refused } = read(whole.subarray(0, 7), whole.subarray(7, 30), whole.subarray(30));
    expect(refused).toEqual([]);
    expect(records.map((record) => record.header.kind)).toEqual(['gate', 'take']);
    expect(records[1]?.payload.toString()).toBe('take-bytes');
  });

  it('refuses a take over the size limit before keeping it', () => {
    const head = frame({ kind: 'take', theme: 'light', bytes: MOST_TAKE_BYTES + 1 }).subarray(0, 60);
    const huge = Buffer.from(JSON.stringify({ kind: 'take', bytes: MOST_TAKE_BYTES + 1 }));
    const length = Buffer.alloc(4);
    length.writeUInt32BE(huge.length);
    const { refused, records } = read(Buffer.concat([length, huge]), head);
    expect(records).toEqual([]);
    expect(refused[0]).toMatch(/take passed/);
  });

  it('refuses bytes that are not a record', () => {
    expect(read(Buffer.from('hello from a scene, not a record')).refused[0]).toMatch(/too long|could not be read/);
  });

  it('refuses a payload on a record that should carry none', () => {
    const { refused } = read(frame({ kind: 'layout' }, Buffer.from('xx')));
    expect(refused[0]).toMatch(/too large/);
  });
});

describe('how many containers run at once', () => {
  afterEach(() => {
    process.env.PATH = realPath;
  });

  function makeCountingDocker() {
    const folder = mkdtempSync(join(tmpdir(), 'fake-docker-'));
    const release = join(folder, 'release');
    writeFileSync(join(folder, 'records.bin'), Buffer.concat(GOOD));
    writeFileSync(join(folder, 'docker'), `#!/bin/sh\nif [ "$1" = run ]; then echo start >> "${join(folder, 'starts')}"; while [ ! -e "${release}" ]; do sleep 0.02; done; cat "${join(folder, 'records.bin')}"; fi\nexit 0\n`);
    chmodSync(join(folder, 'docker'), 0o755);
    process.env.PATH = `${folder}:${realPath}`;
    const countStarts = () => (existsSync(join(folder, 'starts')) ? readFileSync(join(folder, 'starts'), 'utf8').trim().split('\n').length : 0);
    return { countStarts, letThemFinish: () => writeFileSync(release, '') };
  }

  it('waits for room past the cap, then runs every job', async () => {
    const { countStarts, letThemFinish } = makeCountingDocker();
    const worker = createContainerWorker({ limitMs: 20_000, mostAtOnce: 2 });
    const jobs = Array.from({ length: 5 }, () => worker(JOB, new AbortController().signal));
    await vi.waitFor(() => expect(countStarts()).toBe(2), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(countStarts()).toBe(2);
    letThemFinish();
    expect((await Promise.all(jobs)).every(({ isOk }) => isOk)).toBe(true);
    expect(countStarts()).toBe(5);
  });

  it('gives up its place in the queue when the job is no longer wanted', async () => {
    const { countStarts, letThemFinish } = makeCountingDocker();
    const worker = createContainerWorker({ limitMs: 20_000, mostAtOnce: 1 });
    const first = worker(JOB, new AbortController().signal);
    const stopper = new AbortController();
    const second = worker(JOB, stopper.signal);
    stopper.abort();
    expect((await second).isOk).toBe(false);
    letThemFinish();
    await first;
    expect(countStarts()).toBe(1);
  });
});
