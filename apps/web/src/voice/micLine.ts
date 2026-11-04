/** If the agent never says it hears, the sound goes out anyway, so a lost message delays a line and cannot silence it. */
const HOLD_AT_MOST_MS = 12_000;

/** More than a hold and a catch-up together, so a line that can never drain still closes. */
const DRAIN_AT_MOST_MS = 14_000;
/** The last sound is still on its way when the track stops, and leaving the room sooner would cut it off at the agent. */
const LEAVE_AFTER_LAST_SOUND_MS = 300;

/** One microphone from capture to the room. */
export interface MicLine {
  /** What the room receives. */
  track: MediaStreamTrack;
  /** Keeps the sound here from now on, in memory, until `release`. */
  hold(): void;
  release(): void;
  /** Ends the capture at once and sends only what it already holds. Resolves when the line can leave the room. */
  finish(): Promise<void>;
  /** Ends the capture and drops anything held. It runs at once and more than once. */
  stop(): void;
}

export interface MicLineOptions {
  onSteadyNoise?(): void;
  onFinished?(): void;
}

// A published track has no audio at the agent for about 300 ms, and Muse takes 1.2 to 2.3 s to answer, so what a student says first waits here and nothing is lost.
// With no running audio graph the track goes straight to the room, because held sound would never come out.
export function openMicLine(captured: MediaStreamTrack, audioContext: AudioContext, { onSteadyNoise, onFinished }: MicLineOptions = {}): MicLine {
  if (audioContext.state !== 'running') {
    const stop = () => captured.stop();
    return {
      track: captured,
      hold() {},
      release() {},
      stop,
      finish() {
        stop();
        onFinished?.();
        return Promise.resolve();
      },
    };
  }
  const source = audioContext.createMediaStreamSource(new MediaStream([captured]));
  const held = new AudioWorkletNode(audioContext, 'held-mic');
  const out = audioContext.createMediaStreamDestination();
  source.connect(held);
  held.connect(out);
  const [track] = out.stream.getAudioTracks();
  if (!track) throw new DOMException('the audio graph gave no track', 'NotReadableError');
  let holdLimit: ReturnType<typeof setTimeout> | undefined;
  let drainLimit: ReturnType<typeof setTimeout> | undefined;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;
  let finishing: ((value?: undefined) => void) | undefined;
  let hasSaidFinished = false;
  const sayFinished = () => {
    if (!finishing || hasSaidFinished) return;
    hasSaidFinished = true;
    onFinished?.();
  };
  const leave = () => {
    clearTimeout(drainLimit);
    clearTimeout(leaveTimer);
    sayFinished();
    finishing?.();
  };
  held.port.onmessage = ({ data }) => {
    if (data === 'steadyNoise') onSteadyNoise?.();
    if (data !== 'drained') return;
    clearTimeout(drainLimit);
    track.stop();
    sayFinished();
    leaveTimer = setTimeout(leave, LEAVE_AFTER_LAST_SOUND_MS);
  };
  const release = () => {
    clearTimeout(holdLimit);
    held.port.postMessage('release');
  };
  const hold = () => {
    clearTimeout(holdLimit);
    held.port.postMessage('hold');
    holdLimit = setTimeout(release, HOLD_AT_MOST_MS);
  };
  const stop = () => {
    clearTimeout(holdLimit);
    captured.stop();
    track.stop();
    source.disconnect();
    held.disconnect();
    held.port.postMessage('close');
    leave();
  };
  hold();
  return {
    track,
    hold,
    release,
    stop,
    finish() {
      captured.stop();
      source.disconnect();
      held.port.postMessage('endInput');
      drainLimit = setTimeout(stop, DRAIN_AT_MOST_MS);
      return new Promise((resolve) => {
        finishing = resolve;
      });
    },
  };
}
