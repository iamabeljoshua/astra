import { inference, initializeLogger, stt, voice } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EARS_SETTINGS, startEars } from '../src/live/ears.ts';
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

class SilentTranscriber extends stt.STT {
  label = 'test.silent';
  constructor() {
    super({ streaming: true, interimResults: true, diarization: false, alignedTranscript: false });
  }
  protected override _recognize(): Promise<stt.SpeechEvent> {
    throw new Error('not used');
  }
  override stream(): stt.SpeechStream {
    throw new Error('not used');
  }
}

describe('what the session is really started with', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes record false to session.start, so a changed call fails even if the constant stays right', async () => {
    initializeLogger({ pretty: false, level: 'silent' });
    const started = vi.spyOn(voice.AgentSession.prototype, 'start').mockResolvedValue(undefined);
    await startEars({ room: {} as Room, transcriber: new SilentTranscriber(), vad: {} as inference.VAD, onEvent: () => {} });
    expect(started).toHaveBeenCalledTimes(1);
    expect(started.mock.calls[0]?.[0]).toMatchObject({ record: false, inputOptions: { closeOnDisconnect: false }, outputOptions: { audioEnabled: false, transcriptionEnabled: false } });
  });
});
