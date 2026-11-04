import { makeElevenLabsVoice } from './elevenlabs.ts';
import { makeMuseTranscriber, type MuseOptions } from './meta.ts';
import type { TranscriberAdapter, VoiceAdapter } from './types.ts';

/** Chris, one of ElevenLabs' own voices and Abel's choice by ear. A voice change is this one id. */
export const TUTOR_VOICE_ID = 'iP95p4xoKVk53GoZ742B';
export const TUTOR_VOICE_NAME = 'chris';

export function makeTutorVoice({ apiKey, model }: { apiKey: string; model?: string }): VoiceAdapter {
  return makeElevenLabsVoice({ name: TUTOR_VOICE_NAME, apiKey, voiceId: TUTOR_VOICE_ID, model });
}

export function makeTutorTranscriber(options: MuseOptions): TranscriberAdapter {
  return makeMuseTranscriber(options);
}
