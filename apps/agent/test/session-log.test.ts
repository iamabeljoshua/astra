import { type Beat, type BrowserMessage, parseBeat } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { getLabGrant } from '../src/lab/lab-grants.ts';
import { readDataMessage } from '../src/live/read-data-message.ts';
import { createSessionLog } from '../src/live/session-log.ts';

const parsed = parseBeat({ id: 'beat-one', script: [{ kind: 'text', id: 'note', text: 'n' }, 'Look at this.'], expectsReply: false });
if (!parsed.ok) throw new Error(parsed.problem);
const BEAT: Beat = parsed.value;

const played = (browserMs: number, startedMsAgo: number, clockId = 'page-one'): BrowserMessage => ({ type: 'played', turnId: 'turn-1' as never, beatId: BEAT.id, clockId, browserMs, startedMsAgo, wordStartsMs: [0, 200, 400], durationMs: startedMsAgo, playedWords: 3, firedCueMs: [0], ending: 'finished', frozen: [] });

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
    log.write({ type: 'boardFrozen', turnId: 'turn-1' as never, clockId: 'page-one', browserMs: 5100, startedMsAgo: 0, frozen: [] });
    expect(written).toEqual([0, 1]);
  });

  it('writes no event for questionHeard, or for a beat it never sent', () => {
    const log = createSessionLog({ getNowMs: () => 2000, getBeat: () => undefined });
    expect(log.write({ type: 'questionHeard', turnId: 'turn-1' as never, beatId: BEAT.id, clockId: 'page-one', browserMs: 5000, startedMsAgo: 0 })).toBeNull();
    expect(log.write(played(5000, 800))).toBeNull();
    expect(log.getEvents()).toEqual([]);
  });

  it('refuses a report the parser refuses, says why, and goes on writing, because one bad report must not end a lesson', () => {
    const refused: string[] = [];
    const log = createSessionLog({ getNowMs: () => 2000, getBeat: () => BEAT, onRefused: (problem) => refused.push(problem) });
    expect(log.write({ ...played(5000, 800), playedWords: 9 } as BrowserMessage)).toBeNull();
    expect(refused).toHaveLength(1);
    expect(log.write(played(5100, 800))?.seq).toBe(0);
  });

  it('keeps a page reload from moving later beats, because a new page restarts the browser clock at zero', () => {
    let nowMs = 60_000;
    const log = createSessionLog({ getNowMs: () => nowMs, getBeat: () => BEAT });
    log.write(played(50_000, 800));
    nowMs = 70_000;
    log.write(played(2000, 800, 'page-two'));
    expect(log.getEvents().map((event) => event.atMs)).toEqual([59_200, 69_200]);
  });
});

describe('readDataMessage', () => {
  it('refuses broken JSON from the browser instead of throwing, because a throw in a room event ends the agent', () => {
    expect(readDataMessage(new TextEncoder().encode('{not json')).ok).toBe(false);
    expect(readDataMessage(new TextEncoder().encode('{"type":"pulse"}'))).toEqual({ ok: true, value: { type: 'pulse' } });
  });
});

describe('the lab room tokens', () => {
  it('give the page no way to publish audio, and the agent no way to listen', () => {
    expect(getLabGrant('lab-1', 'page')).toEqual({ room: 'lab-1', roomJoin: true, canPublishData: true, canPublish: false, canSubscribe: true });
    expect(getLabGrant('lab-1', 'agent')).toEqual({ room: 'lab-1', roomJoin: true, canPublishData: true, canPublish: true, canSubscribe: false });
  });
});
