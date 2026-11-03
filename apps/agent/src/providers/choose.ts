import { makeElevenLabsVoice } from './elevenlabs.ts';
import type { VoiceAdapter } from './types.ts';

/** Casey, Abel's choice from the ElevenLabs library. A library voice's owner can withdraw it after a notice, so this id lives only here. */
export const TUTOR_VOICE_ID = 'WzsP0bfiCpSDfNgLrUuN';

/** The one place that chooses, so a voice swap is one line. */
export function makeTutorVoice({ apiKey, model }: { apiKey: string; model?: string }): VoiceAdapter {
  return makeElevenLabsVoice({ name: 'casey', apiKey, voiceId: TUTOR_VOICE_ID, model });
}
