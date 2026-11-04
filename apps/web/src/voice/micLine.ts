/** If the agent never says it hears, the sound goes out anyway, so a lost message delays a line and cannot silence it. */
const HOLD_AT_MOST_MS = 12_000;

/** One microphone from capture to the room. */
export interface MicLine {
  /** What the room receives. */
  track: MediaStreamTrack;
  /** Keeps the sound here from now on, in memory, until `release`. */
  hold(): void;
  release(): void;
  /** Ends the capture and drops anything held. It runs at once and more than once. */
  stop(): void;
}

// A published track has no audio at the agent for about 300 ms, and Muse takes 1.2 to 2.3 s to answer, so what a student says first waits here and nothing is lost.
// With no running audio graph the track goes straight to the room, because held sound would never come out.
export function openMicLine(captured: MediaStreamTrack, audioContext: AudioContext): MicLine {
  if (audioContext.state !== 'running') return { track: captured, hold() {}, release() {}, stop: () => captured.stop() };
  const source = audioContext.createMediaStreamSource(new MediaStream([captured]));
  const held = new AudioWorkletNode(audioContext, 'held-mic');
  const out = audioContext.createMediaStreamDestination();
  source.connect(held);
  held.connect(out);
  const [track] = out.stream.getAudioTracks();
  if (!track) throw new DOMException('the audio graph gave no track', 'NotReadableError');
  let holdLimit: ReturnType<typeof setTimeout> | undefined;
  const release = () => {
    clearTimeout(holdLimit);
    held.port.postMessage('release');
  };
  const hold = () => {
    clearTimeout(holdLimit);
    held.port.postMessage('hold');
    holdLimit = setTimeout(release, HOLD_AT_MOST_MS);
  };
  hold();
  return {
    track,
    hold,
    release,
    stop() {
      clearTimeout(holdLimit);
      captured.stop();
      track.stop();
      source.disconnect();
      held.disconnect();
      held.port.postMessage('close');
    },
  };
}
