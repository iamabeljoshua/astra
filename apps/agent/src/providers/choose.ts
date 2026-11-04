import { makeElevenLabsVoice } from './elevenlabs.ts';
import type { VoiceAdapter } from './types.ts';

/** Casey, from the ElevenLabs library. An owner can withdraw a library voice after a notice, so this id lives only here. */
export const TUTOR_VOICE_ID = 'WzsP0bfiCpSDfNgLrUuN';

export function makeTutorVoice({ apiKey, model }: { apiKey: string; model?: string }): VoiceAdapter {
  return makeElevenLabsVoice({ name: 'casey', apiKey, voiceId: TUTOR_VOICE_ID, model });
}
