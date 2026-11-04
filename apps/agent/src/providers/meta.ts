import type { APIConnectOptions } from '@livekit/agents';
import { DEFAULT_API_CONNECT_OPTIONS, stt } from '@livekit/agents';
import * as meta from '@livekit/agents-plugin-meta';
import { AudioFrame } from '@livekit/rtc-node';
import { WebSocket } from 'ws';
import type { LineTranscriber, TranscriberAdapter } from './types.ts';

/** Meta's designation policy lists this name as a Standard Model, so using it is Standard Services, which do not train on content. Pinned, because Contributor Services do. */
export const MUSE_MODEL = 'muse-voice-transcribe-1.0';

const SAMPLE_RATE = 24_000;
const FRAME_MS = 100;
const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_MS) / 1000;

export interface MuseTimings {
  /** Muse gives no final with no frames, so silence is sent after this much quiet, for a line still waiting on its final. */
  padAfterMs: number;
  /** With no frames for this long the microphone is off or the link is gone, so the session closes and costs nothing. It outlasts LiveKit's own retries of 3 to 5 s, and comes before Muse's own close at about 16 s, so the session ends on our word. */
  closeAfterQuietMs: number;
  /** A student holding to talk sends no frames between lines, and the next hold must not pay a new handshake of 1.2 to 2.3 s. Silence costs $0.18 an hour, so this costs at most $0.003 a line. */
  closeAfterLineMs: number;
  /** Audio took about 143 ms longer than a data message from agent to page, and by inference about that the other way, so the end waits for what is still on its way. Frames cannot say when that is, because they keep coming until the track leaves. */
  lineTailMs: number;
  /** Muse caps a session at 60 minutes and the plugin only reports the close, so a new session opens before that. */
  rotateAtPauseAfterMs: number;
  rotateAnywayAfterMs: number;
  retryAfterMs: number;
  longestRetryMs: number;
}

export const MUSE_TIMINGS: MuseTimings = { padAfterMs: 400, closeAfterQuietMs: 10_000, closeAfterLineMs: 60_000, lineTailMs: 200, rotateAtPauseAfterMs: 50 * 60_000, rotateAnywayAfterMs: 55 * 60_000, retryAfterMs: 500, longestRetryMs: 30_000 };

export interface MuseOptions {
  apiKey: string;
  timings?: Partial<MuseTimings>;
  webSocketFactory?: meta.WebSocketFactory;
  onNote?(note: MuseNote): void;
}

export type MuseNote = { kind: 'opened'; atMs: number } | { kind: 'ready'; handshakeMs: number } | { kind: 'hearing' } | { kind: 'firstEvent'; openMs: number } | { kind: 'closed'; reason: string } | { kind: 'lineFlushed' };

function makeSilence(): AudioFrame {
  return new AudioFrame(new Int16Array(SAMPLES_PER_FRAME), SAMPLE_RATE, 1, SAMPLES_PER_FRAME);
}

interface MuseSession {
  stream: stt.SpeechStream;
  openedAtMs: number;
  isReady: boolean;
  isEndingLine: boolean;
}

// Holds one live Muse session at a time, opened by the first real frame so a typed session never opens one, and replaced before Muse's cap or after a close.
// The plugin paces audio from its first packet, so frames queued during a handshake would sit behind real time for the whole session, 3 s on a measured run. Frames before Muse answers are dropped. The browser holds the microphone's sound until this says `hearing`, so those frames are silence.
class MuseSpeechStream extends stt.SpeechStream {
  label = 'astra.muse';
  readonly #newSession: (onReady: () => void) => stt.SpeechStream;
  readonly #timings: MuseTimings;
  readonly #onNote?: (note: MuseNote) => void;
  #session: MuseSession | null = null;
  #nextSession: MuseSession | null = null;
  #lastFrameAtMs = 0;
  #isSpeaking = false;
  #isHearing = false;
  #failures = 0;
  #nextOpenAtMs = 0;
  #padTimer: ReturnType<typeof setInterval> | undefined;
  #lineTailTimer: ReturnType<typeof setTimeout> | undefined;
  #closeAfterQuietMs: number;

  constructor(transcriber: stt.STT, options: { newSession(onReady: () => void): stt.SpeechStream; timings: MuseTimings; onNote?(note: MuseNote): void; connOptions?: APIConnectOptions }) {
    super(transcriber, SAMPLE_RATE, options.connOptions ?? DEFAULT_API_CONNECT_OPTIONS);
    this.#newSession = options.newSession;
    this.#timings = options.timings;
    this.#onNote = options.onNote;
    this.#closeAfterQuietMs = options.timings.closeAfterQuietMs;
  }

  // Muse's only word for this is `endStream`, which ends the session, so the next one opens now and stays warm on silence.
  endLine(): void {
    clearTimeout(this.#lineTailTimer);
    this.#lineTailTimer = setTimeout(() => this.#endLineNow(), this.#timings.lineTailMs);
  }

  #endLineNow(): void {
    const ending = this.#session;
    if (!ending) return this.#onNote?.({ kind: 'lineFlushed' });
    ending.isEndingLine = true;
    this.#session = this.#nextSession ?? this.#open();
    this.#nextSession = null;
    this.#isHearing = false;
    this.#isSpeaking = false;
    this.#closeAfterQuietMs = this.#timings.closeAfterLineMs;
    ending.stream.endInput();
  }

  #open(): MuseSession | null {
    if (Date.now() < this.#nextOpenAtMs) return null;
    const openedAtMs = Date.now();
    const session: MuseSession = {
      openedAtMs,
      isReady: false,
      isEndingLine: false,
      stream: this.#newSession(() => {
        session.isReady = true;
        this.#onNote?.({ kind: 'ready', handshakeMs: Date.now() - openedAtMs });
      }),
    };
    this.#onNote?.({ kind: 'opened', atMs: openedAtMs });
    void this.#forward(session);
    return session;
  }

  async #forward(session: MuseSession): Promise<void> {
    let hasHeard = false;
    let closeReason = 'ended';
    try {
      for await (const event of session.stream) {
        if (!hasHeard) this.#onNote?.({ kind: 'firstEvent', openMs: Date.now() - session.openedAtMs });
        hasHeard = true;
        this.#failures = 0;
        if (event.type === stt.SpeechEventType.START_OF_SPEECH) this.#isSpeaking = true;
        if (event.type === stt.SpeechEventType.END_OF_SPEECH) this.#isSpeaking = false;
        if (!this.closed) this.queue.put(event);
      }
    } catch (error) {
      closeReason = String(error);
    }
    this.#onNote?.({ kind: 'closed', reason: closeReason });
    if (session.isEndingLine) this.#onNote?.({ kind: 'lineFlushed' });
    if (this.#nextSession === session) this.#nextSession = null;
    if (this.#session !== session) return;
    this.#session = null;
    this.#isSpeaking = false;
    this.#failures += 1;
    const waitMs = Math.min(this.#timings.retryAfterMs * 2 ** (this.#failures - 1), this.#timings.longestRetryMs);
    this.#nextOpenAtMs = Date.now() + waitMs;
  }

  // The old session keeps hearing audio until the new one has answered, so a rotation loses no word.
  #getSession(): MuseSession | null {
    const session = this.#session;
    if (!session) return (this.#session = this.#open());
    const ageMs = Date.now() - session.openedAtMs;
    const isDue = ageMs >= this.#timings.rotateAnywayAfterMs || (ageMs >= this.#timings.rotateAtPauseAfterMs && !this.#isSpeaking);
    if (isDue) this.#nextSession ??= this.#open();
    if (!this.#nextSession?.isReady) return session;
    session.stream.endInput();
    this.#session = this.#nextSession;
    this.#nextSession = null;
    return this.#session;
  }

  #pushToMuse(frame: AudioFrame): void {
    const session = this.#getSession();
    if (session?.isReady) session.stream.pushFrame(frame);
  }

  #pushRealFrame(frame: AudioFrame): void {
    this.#pushToMuse(frame);
    if (this.#isHearing || !this.#session?.isReady) return;
    this.#isHearing = true;
    this.#onNote?.({ kind: 'hearing' });
  }

  #closeForQuiet(): void {
    clearInterval(this.#padTimer);
    this.#padTimer = undefined;
    const sessions = [this.#session, this.#nextSession];
    this.#session = null;
    this.#nextSession = null;
    this.#isSpeaking = false;
    for (const session of sessions) session?.stream.close();
  }

  #onQuietTick = () => {
    const quietMs = Date.now() - this.#lastFrameAtMs;
    if (quietMs < this.#timings.padAfterMs) return;
    this.#isHearing = false;
    if (quietMs >= this.#closeAfterQuietMs) this.#closeForQuiet();
    else this.#pushToMuse(makeSilence());
  };

  protected async run(): Promise<void> {
    for await (const item of this.input) {
      if (typeof item === 'symbol') {
        this.#session?.stream.flush();
        continue;
      }
      this.#lastFrameAtMs = Date.now();
      this.#padTimer ??= setInterval(this.#onQuietTick, FRAME_MS);
      this.#pushRealFrame(item);
    }
    clearInterval(this.#padTimer);
    this.#session?.stream.endInput();
  }

  override close(): void {
    clearInterval(this.#padTimer);
    clearTimeout(this.#lineTailTimer);
    this.#session?.stream.close();
    this.#nextSession?.stream.close();
    this.#session = null;
    this.#nextSession = null;
    super.close();
  }
}

class MuseTranscriber extends stt.STT implements LineTranscriber {
  label = 'astra.muse';
  readonly #muse: meta.STT;
  readonly #timings: MuseTimings;
  readonly #onNote?: (note: MuseNote) => void;
  #onNextSocketReady: () => void = () => {};
  #latestStream: MuseSpeechStream | null = null;

  constructor({ apiKey, timings, webSocketFactory, onNote }: MuseOptions) {
    super({ streaming: true, interimResults: true, diarization: false, alignedTranscript: false });
    this.#muse = new meta.STT({
      apiKey,
      model: MUSE_MODEL,
      languageBias: ['English'],
      keywords: [],
      // Muse's first message answers the handshake, and nothing else in the plugin says when that happened.
      webSocketFactory: (url, options) => {
        const socket = webSocketFactory ? webSocketFactory(url, options) : new WebSocket(url, options);
        socket.once('message', this.#onNextSocketReady);
        return socket;
      },
    });
    this.#muse.on('error', (error) => onNote?.({ kind: 'closed', reason: String(error.error) }));
    this.#timings = { ...MUSE_TIMINGS, ...timings };
    this.#onNote = onNote;
  }

  override get model(): string {
    return MUSE_MODEL;
  }

  override get provider(): string {
    return 'Meta';
  }

  protected override _recognize(): Promise<stt.SpeechEvent> {
    throw new Error('the live session only streams');
  }

  override stream(options?: { connOptions?: APIConnectOptions }): stt.SpeechStream {
    const newSession = (onReady: () => void) => {
      this.#onNextSocketReady = onReady;
      return this.#muse.stream({ connOptions: { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 } });
    };
    this.#latestStream = new MuseSpeechStream(this, { newSession, timings: this.#timings, onNote: this.#onNote, connOptions: options?.connOptions });
    return this.#latestStream;
  }

  endLine(): void {
    if (this.#latestStream) this.#latestStream.endLine();
    else this.#onNote?.({ kind: 'lineFlushed' });
  }

  override async close(): Promise<void> {
    await this.#muse.close();
  }
}

export function makeMuseTranscriber(options: MuseOptions): TranscriberAdapter {
  return { name: 'muse', makeStt: () => new MuseTranscriber(options) };
}
