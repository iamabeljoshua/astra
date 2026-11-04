/// <reference lib="dom" />
// Runs in the page before anything else. The app asks for a microphone the normal way and gets this track, so everything after it is the real speech path, and a proof controls exactly when each sound plays.

interface SpeechInPage {
  play(pcmBase64: string, sampleRate: number): Promise<{ startedEpochMs: number; endedEpochMs: number }>;
  setNoise(level: number): void;
}

declare global {
  interface Window {
    speechInPage: SpeechInPage;
  }
}

export function installSpeechInPage(): void {
  let context: AudioContext | null = null;
  let destination: MediaStreamAudioDestinationNode | null = null;
  let noiseGain: GainNode | null = null;
  const getEpochMs = () => performance.timeOrigin + performance.now();

  const ensureContext = () => {
    if (context && destination && noiseGain) return { context, destination, noiseGain };
    context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    destination = context.createMediaStreamDestination();
    noiseGain = context.createGain();
    noiseGain.gain.value = 0;
    const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    noiseBuffer.getChannelData(0).forEach((_, index, channel) => {
      channel[index] = Math.random() * 2 - 1;
    });
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    noise.connect(noiseGain);
    noiseGain.connect(destination);
    noise.start();
    void context.resume();
    return { context, destination, noiseGain };
  };

  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (!constraints?.audio) throw new DOMException('no camera in this proof', 'NotFoundError');
    return new MediaStream(ensureContext().destination.stream.getAudioTracks());
  };

  window.speechInPage = {
    setNoise(level) {
      ensureContext().noiseGain.gain.value = level;
    },
    play(pcmBase64, sampleRate) {
      const { context: audio, destination: out } = ensureContext();
      const bytes = Uint8Array.from(atob(pcmBase64), (character) => character.charCodeAt(0));
      const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
      const buffer = audio.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(Float32Array.from(samples, (sample) => sample / 32768), 0);
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.connect(out);
      const startedEpochMs = getEpochMs();
      source.start();
      return new Promise((resolve) => {
        source.onended = () => resolve({ startedEpochMs, endedEpochMs: getEpochMs() });
      });
    },
  };
}
