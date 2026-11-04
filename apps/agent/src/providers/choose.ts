import { makeElevenLabsVoice } from './elevenlabs.ts';
import { makeMuseTranscriber, type MuseOptions } from './meta.ts';
import type { TranscriberAdapter, VoiceAdapter } from './types.ts';

/** Chris, one of ElevenLabs' own voices and Abel's choice by ear. A voice change is this one id. */
export const TUTOR_VOICE_ID = 'iP95p4xoKVk53GoZ742B';
export const TUTOR_VOICE_NAME = 'chris';
/** Abel chose these by ear on the shared board prototype. Stability changed how often Eric ran long, so a change here reruns `voice-probe --job overlong`. */
export const TUTOR_VOICE_SETTINGS = { stability: 0.45, similarity_boost: 0.8, speed: 1.0 };

export function makeTutorVoice({ apiKey, model, baseURL }: { apiKey: string; model?: string; baseURL?: string }): VoiceAdapter {
  return makeElevenLabsVoice({ name: TUTOR_VOICE_NAME, apiKey, voiceId: TUTOR_VOICE_ID, model, baseURL, voiceSettings: TUTOR_VOICE_SETTINGS });
}

export function makeTutorTranscriber(options: MuseOptions): TranscriberAdapter {
  return makeMuseTranscriber(options);
}
