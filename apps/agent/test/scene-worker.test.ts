import { describe, expect, it } from 'vitest';
import { createRecordReader, getContainerArguments, MOST_TAKE_BYTES, type WorkerRecord } from '../src/scenes/render-worker.ts';

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
