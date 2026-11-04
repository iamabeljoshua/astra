import { describe, expect, it } from 'vitest';
import { EARS_SETTINGS } from '../src/live/ears.ts';
import { TURN_TIMINGS } from '../src/live/turn-rule.ts';

describe('the settings the proofs rest on', () => {
  it('turn off what would change words, deafen the transcriber, keep audio, or end a session on a drop', () => {
    expect(EARS_SETTINGS.ttsTextTransforms).toBeNull();
    expect(EARS_SETTINGS.aecWarmupDuration).toBeNull();
    expect(EARS_SETTINGS.record).toBe(false);
    expect(EARS_SETTINGS.closeOnDisconnect).toBe(false);
    expect(EARS_SETTINGS.interruption).toEqual({ mode: 'vad', minWords: 9999, resumeFalseInterruption: false });
  });

  it('hold a 300 ms floor and a 1 s cap, with 2 s after a question or an interruption', () => {
    expect(EARS_SETTINGS.endpointing).toEqual({ minDelay: 300, maxDelay: 1000 });
    expect(TURN_TIMINGS.patientTurnCapMs).toBe(2000);
  });
});
