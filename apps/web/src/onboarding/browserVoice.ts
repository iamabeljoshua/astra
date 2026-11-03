import type { TutorVoice } from './answers';

const VOICE_TONES: Record<TutorVoice, { pitch: number; rate: number }> = {
  ada: { pitch: 1.05, rate: 0.95 },
  kofi: { pitch: 0.8, rate: 0.95 },
  noor: { pitch: 1.25, rate: 1.1 },
};

function getSpeechEngine() {
  return 'speechSynthesis' in window ? window.speechSynthesis : null;
}

// Stand-in until M3.6. A cloud voice would send the student's name to a voice service, so only on-device voices may speak.
function findDeviceVoice(engine: SpeechSynthesis) {
  const deviceVoices = engine.getVoices().filter((voice) => voice.localService);
  return deviceVoices.find((voice) => voice.default && voice.lang.startsWith('en')) ?? deviceVoices.find((voice) => voice.lang.startsWith('en'));
}

// Chrome fills its voice list only after the first read, so a screen reads it ahead of the first tap.
export function prepareBrowserVoices() {
  getSpeechEngine()?.getVoices();
}

export function stopSpeaking() {
  getSpeechEngine()?.cancel();
}

export function speak(text: string, voice: TutorVoice, onEnd: () => void): boolean {
  const engine = getSpeechEngine();
  const deviceVoice = engine && findDeviceVoice(engine);
  if (!engine || !deviceVoice) return false;

  engine.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = deviceVoice;
  utterance.pitch = VOICE_TONES[voice].pitch;
  utterance.rate = VOICE_TONES[voice].rate;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  engine.speak(utterance);
  return true;
}
