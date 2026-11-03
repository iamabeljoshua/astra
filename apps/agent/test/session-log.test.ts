import { type Beat, type BrowserMessage, parseBeat } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { createSessionLog } from '../src/live/session-log.ts';

const parsed = parseBeat({ id: 'beat-one', script: [{ kind: 'text', id: 'note', text: 'n' }, 'Look at this.'], expectsReply: false });
if (!parsed.ok) throw new Error(parsed.problem);
const BEAT: Beat = parsed.value;

const played = (browserMs: number, startedMsAgo: number): BrowserMessage => ({ type: 'played', turnId: 'turn-1' as never, beatId: BEAT.id, browserMs, startedMsAgo, wordStartsMs: [0, 200, 400], durationMs: startedMsAgo, playedWords: 3, firedCueMs: [0], ending: 'finished', frozen: [] });

describe('createSessionLog', () => {
  it('stamps a beat at when it started, and keeps the gaps the browser saw even if a message is slow', () => {
    let nowMs = 1000;
    const log = createSessionLog({ getNowMs: () => nowMs, getBeat: () => BEAT });
    log.write(played(5000, 800));
    nowMs = 3100;
    log.write(played(7000, 800));
    const starts = log.getEvents().map((event) => event.atMs);
    expect(starts).toEqual([200, 2200]);
  });

  it('numbers events from 0, and tells the listener what it wrote', () => {
    const written: number[] = [];
    const log = createSessionLog({ getNowMs: () => 2000, getBeat: () => BEAT, onWritten: (event) => written.push(event.seq) });
    log.write(played(5000, 800));
    log.write({ type: 'boardFrozen', turnId: 'turn-1' as never, browserMs: 5100, startedMsAgo: 0, frozen: [] });
    expect(written).toEqual([0, 1]);
  });

  it('writes no event for questionHeard, or for a beat it never sent', () => {
    const log = createSessionLog({ getNowMs: () => 2000, getBeat: () => undefined });
    expect(log.write({ type: 'questionHeard', turnId: 'turn-1' as never, beatId: BEAT.id, browserMs: 5000, startedMsAgo: 0 })).toBeNull();
    expect(log.write(played(5000, 800))).toBeNull();
    expect(log.getEvents()).toEqual([]);
  });

  it('throws on a report the parser refuses, rather than storing it', () => {
    const log = createSessionLog({ getNowMs: () => 2000, getBeat: () => BEAT });
    expect(() => log.write({ ...played(5000, 800), playedWords: 9 } as BrowserMessage)).toThrow(/log refused/);
  });
});
