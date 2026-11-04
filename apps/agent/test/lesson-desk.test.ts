import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createLessonDesk, parseLessonRequest } from '../src/scenes/lesson/lesson-desk.ts';
import { createSpendLedger } from '../src/scenes/spend-ledger.ts';

const REQUEST = { sessionId: 'session-1', studentId: 'maya', request: 'What a derivative really measures', isCard: true };

function setUp({ studentLimitUsd = 2 } = {}) {
  const ledger = createSpendLedger(join(mkdtempSync(join(tmpdir(), 'lesson-desk-')), 'spend.jsonl'), { limitUsd: 20, studentLimitUsd, voiceCharacterLimit: 1000, studentVoiceCharacterLimit: 100 });
  const finishers = new Map<string, (() => void)>();
  const closers = new Map<string, () => void>();
  const presence = new Map<string, (isHere: boolean) => void>();
  const run = vi.fn(({ sessionId, onClosing, onPresence }: { sessionId: string; onClosing(): void; onPresence?(isHere: boolean): void }) => {
    closers.set(sessionId, onClosing);
    presence.set(sessionId, onPresence ?? (() => {}));
    return new Promise<void>((resolve) => finishers.set(sessionId, resolve));
  });
  const makeToken = vi.fn(async (_room: string, identity: string) => `token-for-${identity}`);
  let nowMs = 0;
  const desk = createLessonDesk({ run, makeToken, ledger, getNowMs: () => nowMs, url: 'ws://room' });
  return { desk, run, ledger, finishers, closers, presence, advance: (ms: number) => (nowMs += ms) };
}

describe('a student opening lessons', () => {
  it('stops at the limit, as 12 opens in 708 ms each cost a router and a planner call', async () => {
    const { desk, run, finishers } = setUp();
    const replies = [];
    for (let index = 0; index < 12; index += 1) {
      replies.push(await desk.start({ ...REQUEST, sessionId: `session-${index}` }));
      finishers.get(`session-${index}`)?.();
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(replies.filter((reply) => 'refused' in reply).length).toBeGreaterThan(0);
    expect(run.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('allows only a few at once', async () => {
    const { desk, run } = setUp();
    const replies = await Promise.all(Array.from({ length: 5 }, (_, index) => desk.start({ ...REQUEST, sessionId: `session-${index}` })));
    expect(run.mock.calls.length).toBe(2);
    expect(replies.filter((reply) => 'refused' in reply).length).toBe(3);
  });

  it('does not count another page on a lesson already running, and starts it once', async () => {
    const { desk, run } = setUp();
    const replies = await Promise.all(Array.from({ length: 12 }, () => desk.start(REQUEST)));
    expect(run).toHaveBeenCalledOnce();
    expect(replies.every((reply) => 'token' in reply && reply.token === 'token-for-student-session-1')).toBe(true);
  });

  it('does not let one student use up another student\'s lessons', async () => {
    const { desk, finishers } = setUp();
    for (let index = 0; index < 12; index += 1) {
      await desk.start({ ...REQUEST, sessionId: `session-${index}` });
      finishers.get(`session-${index}`)?.();
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect('token' in (await desk.start({ ...REQUEST, sessionId: 'other', studentId: 'tola' }))).toBe(true);
  });

  it('opens again once the window has passed', async () => {
    const { desk, finishers, advance } = setUp();
    for (let index = 0; index < 12; index += 1) {
      await desk.start({ ...REQUEST, sessionId: `session-${index}` });
      finishers.get(`session-${index}`)?.();
      await new Promise((resolve) => setImmediate(resolve));
    }
    advance(11 * 60_000);
    expect('token' in (await desk.start({ ...REQUEST, sessionId: 'later' }))).toBe(true);
  });

  it('refuses a student whose dollars for the day are spent, and nobody else', async () => {
    const { desk, ledger } = setUp({ studentLimitUsd: 1 });
    ledger.charge({ studentId: 'maya', anthropicUsd: 1.5 });
    expect(await desk.start(REQUEST)).toMatchObject({ refused: 'studentSpent' });
    expect('token' in (await desk.start({ ...REQUEST, studentId: 'tola', sessionId: 'other' }))).toBe(true);
  });

  it('survives a lesson that fails, and can start that session again', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('the lesson broke')));
    const ledger = createSpendLedger(join(mkdtempSync(join(tmpdir(), 'lesson-desk-')), 'spend.jsonl'), { limitUsd: 20, studentLimitUsd: 2, voiceCharacterLimit: 1000, studentVoiceCharacterLimit: 100 });
    const desk = createLessonDesk({ run: failing, makeToken: async () => 'token', ledger, getNowMs: () => 0, url: 'ws://room' });
    await desk.start(REQUEST);
    await new Promise((resolve) => setImmediate(resolve));
    await desk.start(REQUEST);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('waits for a dying lesson to finish and starts a new one, so a reopened page never lands in an empty room', async () => {
    const { desk, run, closers, finishers } = setUp();
    await desk.start(REQUEST);
    closers.get(REQUEST.sessionId)?.();
    const reopening = desk.start(REQUEST);
    await new Promise((resolve) => setImmediate(resolve));
    expect(run).toHaveBeenCalledOnce();
    finishers.get(REQUEST.sessionId)?.();
    expect('token' in (await reopening)).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('the request a lesson starts from', () => {
  it('reads a good one', () => {
    expect(parseLessonRequest(JSON.stringify(REQUEST))).toEqual(REQUEST);
  });

  it.each(['not json', '[]', 'null', '{}', JSON.stringify({ ...REQUEST, isCard: 'yes' }), JSON.stringify({ ...REQUEST, studentId: 7 }), JSON.stringify({ ...REQUEST, request: 'x'.repeat(5000) })])('refuses %j', (body) => {
    expect(parseLessonRequest(body)).toBeNull();
  });
});

describe('a normal student going back and forth', () => {
  it('can open a third lesson as soon as the first two have nobody on them, and is not told to wait', async () => {
    const { desk, presence } = setUp();
    await desk.start({ ...REQUEST, sessionId: 'first' });
    presence.get('first')?.(false);
    await desk.start({ ...REQUEST, sessionId: 'second' });
    presence.get('second')?.(false);
    expect('token' in (await desk.start({ ...REQUEST, sessionId: 'third' }))).toBe(true);
  });

  it('still refuses a third lesson when two have a student on them, and says which limit it hit', async () => {
    const { desk } = setUp();
    await desk.start({ ...REQUEST, sessionId: 'first' });
    await desk.start({ ...REQUEST, sessionId: 'second' });
    expect(await desk.start({ ...REQUEST, sessionId: 'third' })).toEqual({ refused: 'twoOpen' });
  });

  it('states the real wait when the 10 minute limit stops a student', async () => {
    const { desk, finishers, advance } = setUp();
    for (let index = 0; index < 6; index += 1) {
      await desk.start({ ...REQUEST, sessionId: `session-${index}` });
      finishers.get(`session-${index}`)?.();
      await new Promise((resolve) => setImmediate(resolve));
      advance(60_000);
    }
    expect(await desk.start({ ...REQUEST, sessionId: 'seventh' })).toEqual({ refused: 'tooManyStarts', retryAfterSeconds: 240 });
  });

  it('says a spent day is a spent day, with the time to the next UTC day', async () => {
    const { desk, ledger } = setUp({ studentLimitUsd: 1 });
    ledger.charge({ studentId: 'maya', anthropicUsd: 1 });
    expect(await desk.start(REQUEST)).toMatchObject({ refused: 'studentSpent', retryAfterSeconds: expect.any(Number) });
    ledger.charge({ studentId: 'tola', anthropicUsd: 25 });
    expect(await desk.start({ ...REQUEST, studentId: 'ada', sessionId: 'other' })).toMatchObject({ refused: 'everyoneSpent', retryAfterSeconds: expect.any(Number) });
  });
});

describe('what crosses from the API', () => {
  it('refuses a student ID that is not one plain name, because it names a folder of kept lines', () => {
    const body = (studentId: string) => JSON.stringify({ ...REQUEST, studentId });
    expect(parseLessonRequest(body('../../etc'))).toBeNull();
    expect(parseLessonRequest(body('a/b'))).toBeNull();
    expect(parseLessonRequest(body('00000000-0000-4000-8000-000000000001'))).not.toBeNull();
  });

  it('keeps a card line only when it is short text', () => {
    expect(parseLessonRequest(JSON.stringify({ ...REQUEST, cardLine: 'What is still pushing it?' }))?.cardLine).toBe('What is still pushing it?');
    expect(parseLessonRequest(JSON.stringify({ ...REQUEST, cardLine: 7 }))?.cardLine).toBeUndefined();
  });
});
