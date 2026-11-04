import { type AgentMessage, type Beat, type BrowserMessage, parseBeat, type TurnId } from '@astra/contracts';
import { initializeLogger, tts } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';
import { type EarsEvent, createLiveSession, type LiveSession, VOICE_STALL_MS } from '../src/live/live-session.ts';
import { createTakePicker, type StoredTake } from '../src/live/reactions.ts';
import type { TutorBrain } from '../src/live/stand-in-tutor.ts';
import { TURN_TIMINGS } from '../src/live/turn-rule.ts';
import { createVoiceLine, type VoiceOutput } from '../src/live/voice-line.ts';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';

initializeLogger({ pretty: false, level: 'silent' });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeBeat(id: string, text: string, expectsReply = false): Beat {
  const parsed = parseBeat({ id, script: [{ kind: 'text', id: `${id}-note`, text: 'n' }, text], expectsReply });
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
}

function makeTake(id: string, use: StoredTake['use'], phrase: string): StoredTake {
  const { pcm, words } = renderTone(phrase);
  return { id, use, phrase, sampleRate: 24000, words, base64: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64') };
}

const TAKES = [makeTake('hm', 'reaction', 'Hm.'), makeTake('okay', 'reaction', 'Okay.'), makeTake('right', 'reaction', 'Right.'), makeTake('hello', 'greeting', 'Hello there.'), makeTake('prompt', 'prompt', 'Take your time.'), makeTake('lost', 'voiceLost', 'Sorry about that.')];

const LONG_LINE = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen';

interface Harness {
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
}

function makeOutput(frames: { atMs: number }[], failAfter = Infinity): VoiceOutput {
  let queuedUntilMs = 0;
  return {
    sampleRate: 24000,
    async captureFrame(frame) {
      if (frames.length >= failAfter) throw new Error('InvalidState - failed to capture frame');
      frames.push({ atMs: performance.now() });
      queuedUntilMs = Math.max(queuedUntilMs, performance.now()) + (frame.samplesPerChannel / frame.sampleRate) * 1000;
    },
    clearQueue() {
      queuedUntilMs = 0;
    },
    async waitForPlayout() {
      await delay(Math.max(0, queuedUntilMs - performance.now()));
    },
  };
}

function start({ voice = makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts(), failAfter }: { voice?: tts.TTS; failAfter?: number } = {}): Harness {
  const messages: AgentMessage[] = [];
  const traces: Harness['traces'] = [];
  const frames: { atMs: number }[] = [];
  const brainRequests: string[] = [];
  let replies = 0;
  const harness = { aborted: 0 } as Harness;
  const tutor: TutorBrain = {
    async *reply({ text }, signal) {
      brainRequests.push(text);
      replies += 1;
      signal.addEventListener('abort', () => {
        harness.aborted += 1;
      });
      yield makeBeat(`reply-${replies}`, LONG_LINE);
    },
  };
  const send = (message: AgentMessage) => void messages.push(message);
  const session = createLiveSession({
    messenger: { send, sendOnBothChannels: send },
    line: createVoiceLine(makeOutput(frames, failAfter)),
    voice,
    tutor,
    takes: createTakePicker(TAKES),
    allTakes: TAKES,
    setTurnCap: () => {},
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

const STAMP = { clockId: 'page', browserMs: 1000, startedMsAgo: 0 };

describe('a student turn', () => {
  it('reacts in a stored voice first, with no brain in its path, then speaks the reply on its own turn', async () => {
    const { say, getTurnsStarted, traces, messages, brainRequests } = start();
    await say('Why does it fall');
    await delay(TURN_TIMINGS.reactionFloorMs + 700);
    const kinds = traces.filter((trace) => trace.name === 'turnStarted').map((trace) => trace.fields.kind);
    expect(kinds).toEqual(['reaction', 'reply']);
    expect(messages.some((message) => message.type === 'heard')).toBe(true);
    expect(getTurnsStarted()).toHaveLength(2);
    expect(brainRequests).toEqual(['Why does it fall']);
  });

  it('keeps the reply silent until the reaction has played and the silence has passed', async () => {
    const { say, messages, getTurnsStarted } = start();
    await say('Why');
    expect(messages.filter((message) => message.type === 'turnStarted')).toHaveLength(1);
    await delay(900);
    expect(getTurnsStarted()).toHaveLength(2);
  });

  it('shows the student their own words', () => {
    const { ears, messages } = start();
    ears({ type: 'voiceStarted' });
    ears({ type: 'words', text: 'Why does', isFinal: false });
    expect(messages).toContainEqual({ type: 'studentWords', text: 'Why does', isFinal: false });
  });
});

describe('barge-in', () => {
  it('stops every live turn, not only the newest, and drops the brain', async () => {
    const harness = start();
    await harness.say('Why');
    await delay(80);
    const reactionTurn = harness.getTurnsStarted()[0] as TurnId;
    harness.ears({ type: 'voiceStarted' });
    harness.ears({ type: 'words', text: 'Wait no', isFinal: false });
    await delay(30);
    expect(harness.didStop(reactionTurn)).toBe(true);
    expect(harness.aborted).toBe(1);
    const framesAtStop = harness.frames.length;
    await delay(400);
    expect(harness.frames.length).toBe(framesAtStop);
  });

  it('gives no turn the line while an earlier one still holds it', async () => {
    const harness = start();
    await harness.say('Why');
    await delay(30);
    harness.ears({ type: 'voiceStarted' });
    harness.ears({ type: 'words', text: 'Wait', isFinal: false });
    harness.ears({ type: 'voiceEnded' });
    harness.ears({ type: 'words', text: 'Wait.', isFinal: true });
    harness.ears({ type: 'turnDecided', text: 'Wait.' });
    await delay(1000);
    expect(harness.brainRequests.at(-1)).toContain('Wait.');
    expect(harness.traces.filter((trace) => trace.name === 'voiceFailed')).toEqual([]);
  });

  it('answers what was never answered, after a stop during thinking with interim words only', async () => {
    const harness = start();
    await harness.say('Gravity.');
    harness.ears({ type: 'voiceStarted' });
    harness.ears({ type: 'words', text: 'It lands', isFinal: false });
    harness.ears({ type: 'voiceEnded' });
    await delay(TURN_TIMINGS.heldFinalMs + 100);
    expect(harness.brainRequests.at(-1)).toBe('Gravity. It lands');
  });
});

describe('a failing voice', () => {
  class SilentVoice extends tts.TTS {
    label = 'silent';
    constructor() {
      super(24000, 1, { streaming: true, alignedTranscript: true });
    }
    synthesize(): tts.ChunkedStream {
      throw new Error('only streams');
    }
    stream(): tts.SynthesizeStream {
      return new SilentStream(this);
    }
  }
  class SilentStream extends tts.SynthesizeStream {
    label = 'silent';
    protected async run(): Promise<void> {
      for await (const _item of this.input) void _item;
      await new Promise(() => {});
    }
  }

  it('says so in a stored line within the bound, rather than leaving the student in silence for 11 s', { timeout: VOICE_STALL_MS + 3000 }, async () => {
    const harness = start({ voice: new SilentVoice() });
    await harness.say('Why');
    await delay(VOICE_STALL_MS + 800);
    const started = harness.traces.filter((trace) => trace.name === 'turnStarted').map((trace) => trace.fields.kind);
    expect(harness.traces.some((trace) => trace.name === 'voiceFailed')).toBe(true);
    expect(started).toContain('voiceLost');
  });

  it('survives a capture failure, and reports the turn cut', async () => {
    const harness = start({ failAfter: 1 });
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: true });
    await delay(600);
    expect(harness.traces.some((trace) => trace.name === 'voiceFailed')).toBe(true);
    const turn = harness.getTurnsStarted()[0] as TurnId;
    expect(harness.didStop(turn)).toBe(true);
    await harness.say('Still there?');
    expect(harness.brainRequests).toEqual(['Still there?']);
  });
});

describe('a dropped link', () => {
  it('stops talking when the pulse stops, and resumes from the report when it returns', { timeout: 8000 }, async () => {
    const harness = start();
    const pulse = (hearsAgent: boolean) => harness.browser({ type: 'pulse', ...STAMP, hearsAgent });
    pulse(true);
    await harness.say('Show me');
    await delay(1100);
    const turn = harness.getTurnsStarted().at(-1) as TurnId;
    pulse(false);
    await delay(50);
    expect(harness.didStop(turn)).toBe(true);
    harness.browser({ type: 'played', turnId: turn, beatId: 'reply-1' as Beat['id'], ...STAMP, wordStartsMs: [0, 280, 560, 840], durationMs: 900, playedWords: 4, firedCueMs: [0], ending: 'interrupted', frozen: [] });
    pulse(true);
    await delay(600);
    const resumed = harness.traces.find((trace) => trace.name === 'resumeStarted');
    expect(resumed?.fields.reported).toBe(true);
    const lastWords = harness.messages.filter((message) => message.type === 'words').at(-1);
    expect(lastWords && lastWords.type === 'words' && lastWords.words[0]?.text).toBe('four');
  });
});

describe('what the agent never does', () => {
  it('refuses a broken report and carries on', async () => {
    const harness = start();
    await harness.say('Why');
    await delay(100);
    const closed = harness.messages.find((message) => message.type === 'beatClosed');
    if (closed?.type !== 'beatClosed') throw new Error('no beat closed');
    harness.browser({ type: 'played', turnId: closed.turnId, beatId: closed.beatId, ...STAMP, wordStartsMs: [], durationMs: 0, playedWords: 99, firedCueMs: [], ending: 'finished', frozen: [] });
    await delay(50);
    expect(harness.traces.some((trace) => trace.name === 'reportRefused')).toBe(true);
  });

  it('never stops a turn twice for a report of its own stop', async () => {
    const harness = start();
    await harness.say('Why');
    await delay(30);
    const turn = harness.getTurnsStarted()[0] as TurnId;
    harness.ears({ type: 'voiceStarted' });
    harness.ears({ type: 'words', text: 'Wait', isFinal: false });
    harness.browser({ type: 'played', turnId: turn, beatId: 'reaction-1' as Beat['id'], ...STAMP, wordStartsMs: [0], durationMs: 10, playedWords: 1, firedCueMs: [], ending: 'interrupted', frozen: [] });
    await delay(30);
    expect(harness.traces.filter((trace) => trace.name === 'browserFroze')).toEqual([]);
  });
});

describe('the greeting', () => {
  it('plays once, when the page says it wants one', async () => {
    const harness = start();
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: true });
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: true });
    await delay(50);
    expect(harness.traces.filter((trace) => trace.name === 'turnStarted').map((trace) => trace.fields.kind)).toEqual(['greeting']);
  });

  it('stays quiet for a student who opened the room by typing', async () => {
    const harness = start();
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: false });
    await delay(50);
    expect(harness.traces.filter((trace) => trace.name === 'turnStarted')).toEqual([]);
  });
});
