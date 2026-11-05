import { describe, expect, it } from 'vitest';
import { createEarlyMessages } from '../src/live/early-messages.ts';

const toMessage = (topic: string) => ({ payload: new Uint8Array(), topic });

describe('messages that arrive before the job knows the student', () => {
  it('gives them back once, in the order they came', () => {
    const early = createEarlyMessages();
    early.hold(toMessage('hello'));
    early.hold(toMessage('opening'));
    expect(early.take().map(({ topic }) => topic)).toEqual(['hello', 'opening']);
    expect(early.take()).toEqual([]);
  });

  it('holds only so many, keeping the first', () => {
    const early = createEarlyMessages();
    for (let index = 0; index < 100; index += 1) early.hold(toMessage(String(index)));
    const taken = early.take();
    expect(taken).toHaveLength(64);
    expect(taken[0]?.topic).toBe('0');
  });
});
