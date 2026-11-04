import type { ChoosingClock, OutputLevel } from '@astra/board';
import probeWorkletUrl from '@astra/board/audio-probe-worklet.js?url';
import type { RemoteTrack } from 'livekit-client';

const LOWERED_GAIN = 0.25;
const SAMPLE_RATE = 48000;
const RESUME_LIMIT_MS = 300;
export const OUTPUT_GAINS: Record<OutputLevel, number> = { full: 1, lowered: LOWERED_GAIN, silent: 0 };

export interface ProbeNote {
  kind: string;
  atMs: number;
  where: 'arriving' | 'output';
}

export interface TutorAudioOptions {
  audioContext: AudioContext;
  gain: GainNode;
  clock: ChoosingClock;
  onProbe?(note: ProbeNote): void;
  tapPcm?(point: 'arriving' | 'output', node: AudioNode): void;
}

export async function createTutorAudioContext(extraWorklets: readonly string[] = []): Promise<AudioContext> {
  const audioContext = new AudioContext({ latencyHint: 'interactive', sampleRate: SAMPLE_RATE });
  await audioContext.audioWorklet.addModule(probeWorkletUrl);
  await Promise.all(extraWorklets.map((url) => audioContext.audioWorklet.addModule(url)));
  await Promise.race([audioContext.resume(), new Promise((resolve) => setTimeout(resolve, RESUME_LIMIT_MS))]);
  return audioContext;
}

// The tutor's audio goes through a probe that counts samples and a gain that a stop closes at once. Returns what undoes it, because a rejoin subscribes to a new track.
export function listenToTutor(track: RemoteTrack, { audioContext, gain, clock, onProbe, tapPcm }: TutorAudioOptions): () => void {
  const source = audioContext.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
  const arriving = new AudioWorkletNode(audioContext, 'audio-probe');
  const output = new AudioWorkletNode(audioContext, 'audio-probe');
  const toMs = (frame: number) => (frame / audioContext.sampleRate) * 1000;
  arriving.port.onmessage = ({ data }) => {
    const event = { kind: data.kind, atMs: toMs(data.frame) };
    clock.onProbeEvent(event);
    if (data.kind === 'onset' || data.kind === 'end') onProbe?.({ ...event, where: 'arriving' });
  };
  output.port.onmessage = ({ data }) => {
    if (data.kind === 'onset' || data.kind === 'end') onProbe?.({ kind: data.kind, atMs: toMs(data.frame), where: 'output' });
  };
  source.connect(arriving);
  source.connect(gain);
  gain.connect(output);
  gain.connect(audioContext.destination);
  tapPcm?.('arriving', source);
  tapPcm?.('output', gain);
  // Chromium pulls remote audio only while the stream is attached to an element, and muting it leaves the gain as the one route out.
  const element = track.attach();
  element.muted = true;
  document.body.append(element);
  return () => {
    source.disconnect();
    gain.disconnect(output);
    arriving.port.onmessage = null;
    output.port.onmessage = null;
    track.detach(element);
    element.remove();
  };
}
