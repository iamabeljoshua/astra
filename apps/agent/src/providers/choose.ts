import { makeElevenLabsVoice } from './elevenlabs.ts';
import { makeMuseTranscriber, type MuseOptions } from './meta.ts';
import type { TranscriberAdapter, VoiceAdapter } from './types.ts';

/** Chris, one of ElevenLabs' own voices and Abel's choice by ear. A voice change is this one id. */
export const TUTOR_VOICE_ID = 'iP95p4xoKVk53GoZ742B';
export const TUTOR_VOICE_NAME = 'chris';

export function makeTutorVoice({ apiKey, model }: { apiKey: string; model?: string }): VoiceAdapter {
  return makeElevenLabsVoice({ name: TUTOR_VOICE_NAME, apiKey, voiceId: TUTOR_VOICE_ID, model });
}

/** Muse, Abel's choice after his real microphone test. Nova-3 stays one adapter away, with `docs/architecture/live-session-proofs/providers/deepgram.ts` as its reference. */
export function makeTutorTranscriber(options: MuseOptions): TranscriberAdapter {
  return makeMuseTranscriber(options);
}
