import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiLink } from '../src/tutor/api-link.ts';
import { createSessionDigest } from '../src/learner-record/session-digest.ts';
import { playSession } from '../src/learner-record/eval-sessions.ts';
import { writeRecordOfRoom, type RecordPass } from '../src/learner-record/write-record.ts';
import { makeFakeTutorModel } from '../src/providers/fake-model.ts';

const SESSION = '3f2b8c1e-9a4d-4c7b-8e21-6d5f0a9b1c2d';
const STEPS = [
  { student: "I'd like to learn about equations.", tutor: 'Sure.' },
  { work: { text: '2x = 14', status: 'wrong' as const, why: 'does not follow' }, tutor: 'Look at the sign.' },
];

function setup(changes: Partial<RecordPass> = {}) {
  const traces: { name: string; fields?: Record<string, unknown> }[] = [];
  const written: unknown[] = [];
  const costs: number[] = [];
  const model = { ...makeFakeTutorModel(() => ({ pieces: ['{"skip":false,"notes":[{"kind":"struggled","topic":"the sign","detail":null,"evidence":["b3"]}]}'] })), getCostUsd: () => 0.0002 };
  const pass: RecordPass = {
    digest: playSession(STEPS),
    model,
    writeNotes: async (update) => void written.push(update),
    updateKey: 'job-1',
    isOverDailyLimit: () => false,
    addCost: (usd) => costs.push(usd),
    trace: (name, fields) => traces.push({ name, ...(fields ? { fields } : {}) }),
    ...changes,
  };
  return { pass, traces, written, costs, model };
}

describe('the pass that writes a room\'s notes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes what code trusts, under the room\'s key, and reports its cost', async () => {
    const { pass, written, costs } = setup();

    await writeRecordOfRoom(pass);

    expect(written).toEqual([{ updateKey: 'job-1', notes: [{ kind: 'struggled', topic: 'the sign', detail: null, evidence: [{ source: 'board', text: '2x = 14', check: 'wrong' }] }] }]);
    expect(costs).toEqual([0.0002]);
  });

  it.each<[string, Partial<RecordPass>]>([
    ['a model that fails', { model: makeFakeTutorModel(() => ({ pieces: [], failure: 'overloaded' })) }],
    ['a model that writes nonsense', { model: makeFakeTutorModel(() => ({ pieces: ['nonsense'] })) }],
    ['a digest that throws', { digest: { read: () => { throw new Error('broken'); } } }],
    ['an API that is down', { writeNotes: () => Promise.reject(new Error('The API answered 503')) }],
  ])('never throws with %s', async (_what, changes) => {
    const { pass } = setup(changes);

    await expect(writeRecordOfRoom(pass)).resolves.toBeUndefined();
  });

  it('tries the write once more, with the same key, so a lost answer adds nothing twice', async () => {
    const keys: string[] = [];
    const { pass } = setup({
      writeNotes: async ({ updateKey }) => {
        keys.push(updateKey);
        if (keys.length === 1) throw new Error('The API answered 503');
      },
    });

    await writeRecordOfRoom(pass);

    expect(keys).toEqual(['job-1', 'job-1']);
  });

  it('spends nothing over the daily limit', async () => {
    const asks: unknown[] = [];
    const model = makeFakeTutorModel((request) => {
      asks.push(request);
      return { pieces: ['{}'] };
    });
    const { pass, traces, written } = setup({ model, isOverDailyLimit: () => true });

    await writeRecordOfRoom(pass);

    expect(asks).toEqual([]);
    expect(written).toEqual([]);
    expect(traces).toEqual([{ name: 'recordPassSkipped', fields: { why: 'dailyLimit' } }]);
  });

  it('spends nothing on a room where nothing happened', async () => {
    const asks: unknown[] = [];
    const model = makeFakeTutorModel((request) => {
      asks.push(request);
      return { pieces: ['{}'] };
    });
    const digest = createSessionDigest();
    digest.addTurn({ studentText: "I'd like to learn about equations.", spokenText: 'Sure.', endedAs: 'ended', beats: [] });

    await writeRecordOfRoom(setup({ model, digest }).pass);

    expect(asks).toEqual([]);
  });

  it('writes no note when the model itself saw something about safety', async () => {
    const { pass, written } = setup({ model: makeFakeTutorModel(() => ({ pieces: ['{"skip":true,"notes":[{"kind":"struggled","topic":"the sign","detail":null,"evidence":["b3"]}]}'] })) });

    await writeRecordOfRoom(pass);

    expect(written).toEqual([]);
  });

  it('puts no word of the student in any trace', async () => {
    const { pass, traces } = setup();

    await writeRecordOfRoom(pass);

    expect(JSON.stringify(traces)).not.toMatch(/2x|the sign|equations/);
  });

  it('reaches the API with the session in the address and the key as a bearer', async () => {
    const calls: { address: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (address: string, init: RequestInit) => {
      calls.push({ address, init });
      return new Response(JSON.stringify({ wasApplied: true }));
    });
    const link = createApiLink({ apiUrl: 'http://api.test', agentKey: 'key', roomName: `session-${SESSION}-ab12cd34` });

    await link.writeNotes({ updateKey: 'job-1', notes: [] });

    expect(calls[0]?.address).toBe(`http://api.test/agent/sessions/${SESSION}/record`);
    expect(calls[0]?.init.method).toBe('POST');
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe('Bearer key');
  });
});
