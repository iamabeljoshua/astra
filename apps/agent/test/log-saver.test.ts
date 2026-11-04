import type { SessionEvent } from '@astra/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createLogSaver } from '../src/live/log-saver.ts';
import { ApiRefusedError } from '../src/tutor/api-link.ts';

const event = (seq: number, playedWords = 1) => ({ seq, atMs: seq, kind: 'beatPlayed', playedWords }) as unknown as SessionEvent;

describe('saving the log', () => {
  it('sends every event on close', async () => {
    const save = vi.fn(async () => {});
    const saver = createLogSaver({ save });
    saver.note(event(0));
    saver.note(event(1));
    await saver.close();
    expect(save.mock.calls.flat(2).map((saved) => (saved as unknown as SessionEvent).seq)).toEqual([0, 1]);
  });

  it('sends only the furthest report of a row', async () => {
    const save = vi.fn(async () => {});
    const saver = createLogSaver({ save });
    saver.note(event(0, 1));
    saver.note(event(0, 5));
    await saver.close();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]).toEqual([[event(0, 5)]]);
  });

  it('keeps what failed for the next save, with no newer report lost', async () => {
    const save = vi.fn<(events: readonly SessionEvent[]) => Promise<void>>().mockRejectedValueOnce(new Error('down')).mockResolvedValue();
    const onFailed = vi.fn();
    const saver = createLogSaver({ save, onFailed });
    saver.note(event(0));
    await saver.close();
    expect(onFailed).toHaveBeenCalledOnce();
    saver.note(event(1));
    await saver.close();
    expect(save.mock.lastCall?.[0].map(({ seq }) => seq)).toEqual([0, 1]);
  });

  it('drops only the event the API refuses, keeps the rest of its save, and never sends it again', async () => {
    const saved: number[] = [];
    const sent: number[][] = [];
    const save = vi.fn(async (events: readonly SessionEvent[]) => {
      sent.push(events.map(({ seq }) => seq));
      if (events.some(({ seq }) => seq === 2)) throw new ApiRefusedError('The API answered 400 to log');
      saved.push(...events.map(({ seq }) => seq));
    });
    const onFailed = vi.fn();
    const saver = createLogSaver({ save, onFailed });
    for (let seq = 0; seq < 5; seq += 1) saver.note(event(seq));
    await saver.close();
    expect(saved.sort()).toEqual([0, 1, 3, 4]);
    expect(onFailed).toHaveBeenCalledOnce();
    const sendsSoFar = sent.length;
    await saver.close();
    expect(sent).toHaveLength(sendsSoFar);
  });

  it('splits a large log so no save passes the size the API takes', async () => {
    const save = vi.fn(async () => {});
    const saver = createLogSaver({ save });
    for (let seq = 0; seq < 450; seq += 1) saver.note(event(seq));
    await saver.close();
    const sizes = save.mock.calls.map((call) => (call as unknown as [unknown[]])[0].length);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(450);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(200);
  });
});
