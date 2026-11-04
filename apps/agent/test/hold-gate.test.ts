import { describe, expect, it } from 'vitest';
import { createHoldGate } from '../src/live/hold-gate.ts';
import type { TurnEvent } from '../src/live/turn-rule.ts';

const types = (events: TurnEvent[]) => events.map((event) => (event.type === 'timer' ? `timer:${event.name}` : event.type));
const decided = (events: TurnEvent[]) => events.flatMap((event) => (event.type === 'turnDecided' ? [event.text] : []));
const final = (text: string) => ({ type: 'words', text, isFinal: true }) as const;

describe('the hold gate', () => {
  it('passes every ear event through for a student who never holds', () => {
    const gate = createHoldGate();
    for (const event of [{ type: 'voiceStarted' }, { type: 'voiceEnded' }, final('Hi'), { type: 'turnDecided', text: 'Hi' }] as const) {
      expect(gate.onEars(event)).toEqual([event]);
    }
  });

  it('cuts the tutor on the press, as sound with no words does after 800 ms', () => {
    expect(types(createHoldGate().onHoldStarted())).toEqual(['voiceStarted', 'timer:wordlessStop']);
  });

  it('ignores the voice detector while held, because only letting go ends the line', () => {
    const gate = createHoldGate();
    gate.onHoldStarted();
    expect(gate.onEars({ type: 'voiceStarted' })).toEqual([]);
    expect(gate.onEars({ type: 'voiceEnded' })).toEqual([]);
    expect(gate.onEars({ type: 'turnDecided', text: 'Partly said' })).toEqual([]);
  });

  it('keeps the words going through while held, for the captions and the stop', () => {
    const gate = createHoldGate();
    gate.onHoldStarted();
    expect(types(gate.onEars({ type: 'words', text: 'Par', isFinal: false }))).toEqual(['words']);
    expect(types(gate.onEars(final('Part one.')))).toEqual(['words']);
  });

  it('ends the turn on letting go and reacts without the wait', () => {
    const gate = createHoldGate();
    gate.onHoldStarted();
    expect(types(gate.onLineEnded())).toEqual(['voiceEnded', 'timer:reactionFloor']);
  });

  it('decides the turn when Muse is done with the line, with nothing waiting on the detector', () => {
    const gate = createHoldGate();
    gate.onHoldStarted();
    gate.onLineEnded();
    expect(decided(gate.onEars(final('It lands twice as far.')))).toEqual([]);
    expect(decided(gate.onLineFlushed())).toEqual(['It lands twice as far.']);
  });

  it('joins finals that arrive together after letting go, so no words are left for later', () => {
    const gate = createHoldGate();
    gate.onHoldStarted();
    gate.onLineEnded();
    gate.onEars(final('First part.'));
    gate.onEars(final('Second part.'));
    expect(decided(gate.onLineFlushed())).toEqual(['First part. Second part.']);
  });

  it('joins every final of one hold, so a pause while holding is one thought', () => {
    const gate = createHoldGate();
    gate.onHoldStarted();
    gate.onEars(final('Part one.'));
    gate.onLineEnded();
    gate.onEars(final('Part two.'));
    expect(decided(gate.onLineFlushed())).toEqual(['Part one. Part two.']);
  });

  it('decides on the flush when the last final came before letting go', () => {
    const gate = createHoldGate();
    gate.onHoldStarted();
    gate.onEars(final('All of it.'));
    gate.onLineEnded();
    expect(decided(gate.onLineFlushed())).toEqual(['All of it.']);
  });

  it('decides nothing on a flush with no words, so the rule carries the tutor on', () => {
    const gate = createHoldGate();
    gate.onHoldStarted();
    gate.onLineEnded();
    expect(gate.onLineFlushed()).toEqual([]);
    expect(gate.onEars({ type: 'voiceStarted' })).toEqual([{ type: 'voiceStarted' }]);
  });

  it('drops the detector turn that comes later for words it already decided', () => {
    const gate = createHoldGate();
    gate.onHoldStarted();
    gate.onLineEnded();
    gate.onEars(final('It lands twice as far.'));
    gate.onLineFlushed();
    expect(gate.onEars({ type: 'turnDecided', text: 'It lands twice as far.' })).toEqual([]);
  });

  it('keeps only what is new when a later press-once turn carries a decided line', () => {
    const gate = createHoldGate();
    gate.onHoldStarted();
    gate.onLineEnded();
    gate.onEars(final('First line.'));
    gate.onLineFlushed();
    expect(decided(gate.onEars({ type: 'turnDecided', text: 'First line. Second line.' }))).toEqual(['Second line.']);
  });

  it('does not repeat words the detector already took during a hold', () => {
    const gate = createHoldGate();
    gate.onHoldStarted();
    gate.onEars(final('Part one.'));
    gate.onEars({ type: 'turnDecided', text: 'Part one.' });
    gate.onEars(final('Part two.'));
    gate.onLineEnded();
    gate.onLineFlushed();
    expect(gate.onEars({ type: 'turnDecided', text: 'Part two.' })).toEqual([]);
  });

  it('counts a second press before the first line was decided as the same thought', () => {
    const gate = createHoldGate();
    gate.onHoldStarted();
    gate.onEars(final('Part one.'));
    gate.onLineEnded();
    gate.onHoldStarted();
    gate.onLineEnded();
    gate.onEars(final('Part two.'));
    expect(decided(gate.onLineFlushed())).toEqual(['Part one. Part two.']);
  });

  it('takes a second holdStarted or a lineEnded with no hold as nothing', () => {
    const gate = createHoldGate();
    expect(gate.onLineEnded()).toEqual([]);
    gate.onHoldStarted();
    expect(gate.onHoldStarted()).toEqual([]);
  });

  it('says whether a hold is open, for a reply that starts during one', () => {
    const gate = createHoldGate();
    expect(gate.isHolding()).toBe(false);
    gate.onHoldStarted();
    expect(gate.isHolding()).toBe(true);
    gate.onLineEnded();
    expect(gate.isHolding()).toBe(false);
  });
});
