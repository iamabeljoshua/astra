import { makeCartesiaVoice } from './cartesia.ts';
import { makeDeepgramTranscriber } from './deepgram.ts';
import { IN_PROCESS_VOICE } from './fakes.ts';
import type { TranscriberAdapter, VoiceAdapter } from './types.ts';

const FAKE_VOICE_URL = `http://127.0.0.1:${process.env.FAKE_TTS_PORT ?? 17801}`;
const FAKE_SPEECH_URL = `ws://127.0.0.1:${process.env.FAKE_STT_PORT ?? 17802}`;

export const VOICES: Record<string, VoiceAdapter> = {
  fakeCartesia: makeCartesiaVoice({ name: 'fakeCartesia', apiKey: 'fake', baseUrl: FAKE_VOICE_URL }),
  inProcess: IN_PROCESS_VOICE,
};

export const TRANSCRIBERS: Record<string, TranscriberAdapter> = {
  fakeDeepgram: makeDeepgramTranscriber({ name: 'fakeDeepgram', apiKey: 'fake', baseUrl: FAKE_SPEECH_URL }),
};

export const ACTIVE = {
  voice: VOICES[process.env.ACTIVE_VOICE ?? 'fakeCartesia'] as VoiceAdapter,
  transcriber: TRANSCRIBERS.fakeDeepgram as TranscriberAdapter,
};
