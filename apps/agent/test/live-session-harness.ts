import { type AgentMessage, type Beat, type BrowserMessage, parseBeat, type TurnId, type TutorClosedReason } from '@astra/contracts';
import { initializeLogger, tts } from '@livekit/agents';
import { afterEach } from 'vitest';
import { type EarsEvent, createLiveSession, type LiveSession, type LiveSessionOptions } from '../src/live/live-session.ts';
import { createTakePicker, type StoredTake } from '../src/live/reactions.ts';
import type { TutorBrain } from '../src/live/stand-in-tutor.ts';
import type { TutorBeat } from '../src/tutor/brain.ts';
import { createVoiceLine, type VoiceOutput } from '../src/live/voice-line.ts';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';

initializeLogger({ pretty: false, level: 'silent' });

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function makeBeat(id: string, text: string, expectsReply = false): Beat {
  const parsed = parseBeat({ id, script: [{ kind: 'text', id: `${id}-note`, text: 'n' }, text], expectsReply });
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
}

function makeTake(id: string, use: StoredTake['use'], phrase: string): StoredTake {
  const { pcm, words } = renderTone(phrase);
  return { id, use, phrase, sampleRate: 24000, words, base64: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64') };
}

const TAKES = [makeTake('talk', 'talkInvitation', 'You can talk to me any time, just press Talk.'), makeTake('hm', 'reaction', 'Hm.'), makeTake('okay', 'reaction', 'Okay.'), makeTake('right', 'reaction', 'Right.'), makeTake('hello', 'greeting', 'Hello there.'), makeTake('prompt', 'prompt', 'Take your time.'), makeTake('lost', 'voiceLost', 'Sorry about that.')];

export const LONG_LINE = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen';

export interface Harness {
  session: LiveSession;
  messages: AgentMessage[];
  traces: { name: string; fields: Record<string, unknown> }[];
  frames: { atMs: number }[];
  ears(event: EarsEvent): void;
  browser(message: BrowserMessage): void;
  getTurnsStarted(): TurnId[];
  say(text: string): Promise<void>;
  didStop(turnId: TurnId): boolean;
  brainRequests: string[];
  aborted: number;
  cameBack: number;
}

function makeOutput(frames: { atMs: number }[], failAfter = Infinity): VoiceOutput {
  let queuedUntilMs = 0;
  let endPlayoutWait = () => {};
  return {
    sampleRate: 24000,
    async captureFrame(frame) {
      if (frames.length >= failAfter) throw new Error('InvalidState - failed to capture frame');
      frames.push({ atMs: performance.now() });
      queuedUntilMs = Math.max(queuedUntilMs, performance.now()) + (frame.samplesPerChannel / frame.sampleRate) * 1000;
    },
    clearQueue() {
      queuedUntilMs = 0;
      endPlayoutWait();
    },
    async waitForPlayout() {
      await new Promise<void>((resolve) => {
        endPlayoutWait = resolve;
        setTimeout(resolve, Math.max(0, queuedUntilMs - performance.now()));
      });
    },
  };
}

export function start({ voice = makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts(), failAfter, quietLimitMs, onQuietLimit, tutorBeats, getCostSoFar, endLine, replyLine = LONG_LINE, replyLines = [], closedReason = null, ...endingOptions }: Pick<LiveSessionOptions, 'writeRecap' | 'onRecap' | 'onEnding' | 'onEndingOver' | 'onLogWritten'> & { getCostSoFar?(): number; endLine?: () => void; replyLine?: string; replyLines?: readonly string[]; closedReason?: TutorClosedReason | null; voice?: tts.TTS; failAfter?: number; quietLimitMs?: number; onQuietLimit?(): void; tutorBeats?: readonly TutorBeat[] } = {}): Harness {
  const messages: AgentMessage[] = [];
  const traces: Harness['traces'] = [];
  const frames: { atMs: number }[] = [];
  const brainRequests: string[] = [];
  let replies = 0;
  const harness = { aborted: 0, cameBack: 0 } as Harness;
  const tutor: TutorBrain = {
    noteCameBack() {
      harness.cameBack += 1;
    },
    async *reply({ text }, signal) {
      brainRequests.push(text);
      replies += 1;
      signal.addEventListener('abort', () => {
        harness.aborted += 1;
      });
      if (tutorBeats) yield* tutorBeats;
      else yield makeBeat(`reply-${replies}`, replyLines[replies - 1] ?? replyLine);
    },
    getClosedReason: () => closedReason,
  };
  const send = (message: AgentMessage) => void messages.push(message);
  const session = createLiveSession({
    ...endingOptions,
    ...(getCostSoFar ? { getCostSoFar } : {}),
    messenger: { send, sendOnBothChannels: send },
    line: createVoiceLine(makeOutput(frames, failAfter)),
    voice,
    tutor,
    takes: createTakePicker(TAKES),
    allTakes: TAKES,
    setTurnCap: () => {},
    endLine,
    onQuietLimit,
    ...(quietLimitMs === undefined ? {} : { quietLimitMs }),
    trace: (name, fields = {}) => void traces.push({ name, fields }),
  });
  sessions.push(session);
  return Object.assign(harness, {
    session,
    messages,
    traces,
    frames,
    brainRequests,
    ears: session.onEars,
    browser: session.onBrowser,
    getTurnsStarted: () => messages.flatMap((message) => (message.type === 'turnStarted' ? [message.turnId] : [])),
    didStop: (turnId: TurnId) => messages.some((message) => message.type === 'stop' && message.turnId === turnId),
    async say(text: string) {
      session.onEars({ type: 'voiceStarted' });
      session.onEars({ type: 'words', text, isFinal: false });
      session.onEars({ type: 'voiceEnded' });
      session.onEars({ type: 'words', text, isFinal: true });
      session.onEars({ type: 'turnDecided', text });
      await delay(20);
    },
  });
}

const sessions: LiveSession[] = [];

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
});

export const STAMP = { clockId: 'page', browserMs: 1000, startedMsAgo: 0 };
