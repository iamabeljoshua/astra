import type { AudioFrame } from '@livekit/rtc-node';
import { type AgentMessage, type Beat, parseBeat, type TurnId } from '@astra/contracts';
import { initializeLogger, voice as agentsVoice } from '@livekit/agents';
import { TURN_SILENCE_MS } from '@astra/board';
import { tts } from '@livekit/agents';
import { AudioFrame as RealAudioFrame } from '@livekit/rtc-node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { speakTurn, type SpeakTurnOptions } from '../src/live/speak-turn.ts';
import { createVoiceLine } from '../src/live/voice-line.ts';
import { makeElevenLabsVoice } from '../src/providers/elevenlabs.ts';
import { FAKE_SAMPLE_RATE, renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice, type RenderSpeech } from '../src/providers/rendered-voice.ts';
import { type FakeWire, startFakeElevenLabsWire } from './fake-elevenlabs-wire.ts';

initializeLogger({ pretty: false, level: 'silent' });

const TURN = 'turn-1' as TurnId;
const LEADING_SILENCE_MS = 60;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeBeat(id: string, script: unknown[], expectsReply = false): Beat {
  const parsed = parseBeat({ id, script, expectsReply });
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
}

const BEATS = [makeBeat('one', ['Look ', { kind: 'text', id: 'note', text: 'n' }, 'at this.']), makeBeat('two', ['And ', { kind: 'text', id: 'other', text: 'o' }, 'at that?'], true)];

const withLeadingSilence: RenderSpeech = (text) => {
  const { pcm, sampleRate, words } = renderTone(text);
  const silentSamples = Math.round((LEADING_SILENCE_MS / 1000) * sampleRate);
  const padded = new Int16Array(pcm.length + silentSamples);
  padded.set(pcm, silentSamples);
  return { pcm: padded, sampleRate, words: words.map((word) => ({ ...word, startMs: word.startMs + LEADING_SILENCE_MS })) };
};

function speak({ render = renderTone, ...options }: Partial<SpeakTurnOptions> & { render?: RenderSpeech } = {}) {
  const sent: { message: AgentMessage; isUrgent: boolean }[] = [];
  const captured: AudioFrame[] = [];
  let queueClears = 0;
  let framesAfterStop = 0;
  let isStopped = false;
  const spoken = speakTurn({
    voice: makeRenderedVoice({ name: 'fake', render }).makeTts(),
    turnId: TURN,
    beats: BEATS,
    line: createVoiceLine({
      sampleRate: FAKE_SAMPLE_RATE,
      captureFrame: async (frame) => {
        if (isStopped) framesAfterStop += 1;
        captured.push(frame);
        // A real source takes frames as fast as its queue allows, so this stands in for that pace.
        await delay(1);
      },
      clearQueue: () => (queueClears += 1),
      waitForPlayout: async () => {},
    }),
    messenger: {
      send: (message) => sent.push({ message, isUrgent: false }),
      sendOnBothChannels: (message) => sent.push({ message, isUrgent: true }),
    },
    ...options,
  });
  return {
    spoken,
    sent,
    captured,
    stop() {
      isStopped = true;
      spoken.stop();
    },
    getQueueClears: () => queueClears,
    getFramesAfterStop: () => framesAfterStop,
    getMessages: <Type extends AgentMessage['type']>(type: Type) => sent.map(({ message }) => message).filter((message): message is Extract<AgentMessage, { type: Type }> => message.type === type),
  };
}

let wire: FakeWire | null = null;

afterEach(async () => {
  await wire?.close();
  wire = null;
});

// Records each thing a session's one voice track and its data channels see, in order, with the time.
function createWatchedLine({ playoutMs = 0, frameMs = 1 } = {}) {
  const events: { kind: 'frame' | 'cleared' | 'playedOut' | 'message'; turnId?: string; type?: string; atMs: number }[] = [];
  const note = (event: Omit<(typeof events)[number], 'atMs'>) => events.push({ ...event, atMs: performance.now() });
  const line = createVoiceLine({
    sampleRate: FAKE_SAMPLE_RATE,
    captureFrame: async () => {
      note({ kind: 'frame' });
      await delay(frameMs);
    },
    clearQueue: () => note({ kind: 'cleared' }),
    waitForPlayout: async () => {
      await delay(playoutMs);
      note({ kind: 'playedOut' });
    },
  });
  const messenger = {
    send: (message: AgentMessage) => note({ kind: 'message', turnId: 'turnId' in message ? message.turnId : undefined, type: message.type }),
    sendOnBothChannels: (message: AgentMessage) => note({ kind: 'message', turnId: 'turnId' in message ? message.turnId : undefined, type: message.type }),
  };
  const turn = (turnId: string) => speakTurn({ voice: makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts(), line, messenger, turnId: turnId as TurnId, beats: BEATS });
  const getTurnStartedAtMs = (turnId: string) => events.find((event) => event.type === 'turnStarted' && event.turnId === turnId)?.atMs;
  return { events, line, turn, getTurnStartedAtMs };
}

describe('turns on one voice line', () => {
  // A turn's first sound must follow a silence the probe can see, or the browser loses where the turn starts.
  const LEEWAY_MS = 5;

  it('starts at once on a line that has been quiet, so a turn pays for the silence only when it follows sound', async () => {
    const { turn, getTurnStartedAtMs } = createWatchedLine();
    const startedAtMs = performance.now();
    await turn('t1').finished;
    expect(getTurnStartedAtMs('t1')).toBeLessThan(startedAtMs + TURN_SILENCE_MS);
  });

  it('resolves finished only once the audio has played out', async () => {
    const { events, turn } = createWatchedLine({ playoutMs: 30 });
    await turn('t1').finished;
    expect(events.at(-1)?.kind).toBe('playedOut');
  });

  it('leaves the silence before a turn started on the last one finishing, and holds its messages with its audio', async () => {
    const { events, turn, getTurnStartedAtMs } = createWatchedLine();
    await turn('t1').finished;
    const lastAudioGoneAtMs = events.findLast((event) => event.kind === 'playedOut')?.atMs as number;
    const framesOfFirstTurn = events.filter((event) => event.kind === 'frame').length;
    await turn('t2').finished;
    const firstFrameOfSecondTurn = events.filter((event) => event.kind === 'frame')[framesOfFirstTurn];
    expect(firstFrameOfSecondTurn?.atMs).toBeGreaterThanOrEqual(lastAudioGoneAtMs + TURN_SILENCE_MS - LEEWAY_MS);
    expect(getTurnStartedAtMs('t2')).toBeGreaterThanOrEqual(lastAudioGoneAtMs + TURN_SILENCE_MS - LEEWAY_MS);
    expect(getTurnStartedAtMs('t2')).toBeLessThanOrEqual(firstFrameOfSecondTurn?.atMs as number);
  });

  it('leaves the silence after a stop, however soon the next turn starts', async () => {
    const { events, turn, getTurnStartedAtMs } = createWatchedLine({ frameMs: 20 });
    const first = turn('t1');
    await delay(30);
    const stoppedAtMs = performance.now();
    first.stop();
    await delay(30);
    const framesBefore = events.filter((event) => event.kind === 'frame').length;
    await turn('t2').finished;
    const firstFrame = events.filter((event) => event.kind === 'frame')[framesBefore];
    expect(firstFrame?.atMs).toBeGreaterThanOrEqual(stoppedAtMs + TURN_SILENCE_MS - LEEWAY_MS);
    expect(getTurnStartedAtMs('t2')).toBeGreaterThanOrEqual(stoppedAtMs + TURN_SILENCE_MS - LEEWAY_MS);
  });

  it('never lets a second turn into the first one\'s audio, even if it starts at once', async () => {
    const { events, turn } = createWatchedLine({ playoutMs: 20 });
    const first = turn('t1');
    const second = turn('t2');
    await Promise.all([first.finished, second.finished]);
    const playedOut = events.findIndex((event) => event.kind === 'playedOut');
    const started = events.findIndex((event) => event.type === 'turnStarted' && event.turnId === 't2');
    expect(started).toBeGreaterThan(playedOut);
    expect(events.slice(0, playedOut).some((event) => event.turnId === 't2')).toBe(false);
  });

  it('tells nobody of a turn stopped before its line opened, and leaves the turn before it playing', async () => {
    const { events, turn } = createWatchedLine({ playoutMs: 20 });
    const first = turn('t1');
    const second = turn('t2');
    second.stop();
    await second.finished;
    await first.finished;
    const third = turn('t3');
    await third.finished;
    expect(events.filter((event) => event.turnId === 't2')).toEqual([]);
    expect(events.some((event) => event.kind === 'cleared')).toBe(false);
    expect(events.filter((event) => event.type === 'turnStarted').map((event) => event.turnId)).toEqual(['t1', 't3']);
  });

  it('refuses a rate LiveKit cannot frame in whole samples, because that audio plays slow and nothing reports it', () => {
    const output = { sampleRate: 22050, captureFrame: async () => {}, clearQueue: () => {}, waitForPlayout: async () => {} };
    expect(() => createVoiceLine(output)).toThrow(/22050/);
  });
});

describe('speakTurn', () => {
  it('starts the turn first, sends cues ahead of their words, and closes each beat', async () => {
    const run = speak();
    await run.spoken.finished;
    const types = run.sent.map(({ message }) => message.type);
    expect(types[0]).toBe('turnStarted');
    expect(run.getMessages('cue').map((cue) => [cue.beatId, cue.atWord])).toEqual([['one', 1], ['two', 1]]);
    expect(run.getMessages('beatClosed').map((beat) => [beat.beatId, beat.wordCount, beat.expectsReply])).toEqual([['one', 3, false], ['two', 3, true]]);
    expect(types.indexOf('cue')).toBeLessThan(types.indexOf('words'));
  });

  it('numbers words within their own beat, and word times rise across the turn', async () => {
    const run = speak();
    await run.spoken.finished;
    const words = run.getMessages('words').flatMap((batch) => batch.words.map((word, index) => ({ beatId: batch.beatId, at: batch.firstWord + index, text: word.text, startMs: word.startMs })));
    expect(words.map((word) => word.text)).toEqual(['Look', 'at', 'this.', 'And', 'at', 'that?']);
    expect(words.filter((word) => word.beatId === 'two').map((word) => word.at)).toEqual([0, 1, 2]);
    expect(words.map((word) => word.startMs)).toEqual([...words.map((word) => word.startMs)].sort((first, second) => first - second));
    expect(run.spoken.getWordMismatches()).toEqual([]);
  });

  it('zeroes word times at the first audible sample, whatever silence leads the voice', async () => {
    const plain = speak();
    await plain.spoken.finished;
    const padded = speak({ render: withLeadingSilence });
    await padded.spoken.finished;
    const starts = (run: typeof plain) => run.getMessages('words').flatMap((batch) => batch.words.map((word) => word.startMs));
    expect(starts(padded).slice(0, 3)).toEqual(starts(plain).slice(0, 3));
  });

  it('holds no word until the first sound is known, then sends them all', async () => {
    const silentStart: RenderSpeech = (text) => {
      const { pcm, sampleRate, words } = renderTone(text);
      const padded = new Int16Array(pcm.length + sampleRate);
      padded.set(pcm, sampleRate);
      return { pcm: padded, sampleRate, words: words.map((word) => ({ ...word, startMs: word.startMs + 1000 })) };
    };
    const run = speak({ render: silentStart });
    await run.spoken.finished;
    const starts = run.getMessages('words').flatMap((batch) => batch.words.map((word) => word.startMs));
    expect(starts[0]).toBeLessThan(5);
  });

  it('on a stop, tells the browser on both channels, clears the queue, and hands over no more audio', async () => {
    const run = speak();
    await delay(30);
    run.stop();
    await run.spoken.finished;
    const stops = run.sent.filter(({ message }) => message.type === 'stop');
    expect(stops.map(({ isUrgent }) => isUrgent)).toEqual([true]);
    expect(run.getQueueClears()).toBe(1);
    expect(run.getFramesAfterStop()).toBe(0);
    await delay(50);
    expect(run.getFramesAfterStop()).toBe(0);
  });

  it('sends no words after a stop, from a voice that keeps sending after it is closed, as the real one does', async () => {
    const chunkOf = (text: string, startTime: number) => ({ requestId: 'r', segmentId: 's', final: false, frame: new RealAudioFrame(Int16Array.from({ length: 240 }, () => 12000), FAKE_SAMPLE_RATE, 1, 240), timedTranscripts: [agentsVoice.createTimedString({ text: `${text} `, startTime })] });
    const chunks = [chunkOf('Look', 0), chunkOf('at', 0.2), chunkOf('this.', 0.4)];
    const stream = {
      pushText: () => {},
      flush: () => {},
      endInput: () => {},
      close: () => {},
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) {
          await delay(5);
          yield chunk;
        }
        yield tts.SynthesizeStream.END_OF_STREAM;
      },
    };
    const sent: AgentMessage[] = [];
    const line = createVoiceLine({ sampleRate: FAKE_SAMPLE_RATE, captureFrame: async () => {}, clearQueue: () => {}, waitForPlayout: async () => {} });
    const spoken = speakTurn({
      voice: { stream: () => stream } as unknown as tts.TTS,
      line,
      turnId: TURN,
      beats: [BEATS[0] as Beat],
      messenger: {
        send(message) {
          sent.push(message);
          if (message.type === 'words') spoken.stop();
        },
        sendOnBothChannels: (message) => sent.push(message),
      },
    });
    await spoken.finished;
    await delay(40);
    expect(sent.filter((message) => message.type === 'words')).toHaveLength(1);
  });

  it('counts a stall on a steady clock, so a device clock jump is not a one hour gap', async () => {
    const realNow = Date.now;
    const jumpTimer = setTimeout(() => vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 3_600_000), 20);
    const run = speak();
    await run.spoken.finished;
    clearTimeout(jumpTimer);
    vi.restoreAllMocks();
    expect(run.getMessages('audioGap')).toEqual([]);
  });

  it('reports a stall on the word timeline, past any leading silence, opening and closing it on both channels', async () => {
    const run = speak({ render: withLeadingSilence, proofStalls: [{ atAudioMs: 200, ms: 400 }] });
    await run.spoken.finished;
    const gaps = run.sent.filter(({ message }) => message.type === 'audioGap');
    expect(gaps.every(({ isUrgent }) => isUrgent)).toBe(true);
    const closing = run.getMessages('audioGap').find((gap) => gap.ms !== undefined);
    expect(closing?.ms).toBeGreaterThan(200);
    expect(closing?.atMs).toBeLessThan(400);
  });

  it('sends no dry report when a turn simply ends', async () => {
    const run = speak();
    await run.spoken.finished;
    await delay(150);
    expect(run.getMessages('audioGap').filter((gap) => gap.ms === undefined)).toEqual([]);
  });

  it('cuts the turn when the voice ends early, so the browser reports what was heard and waits for nothing', async () => {
    const endsEarly: RenderSpeech = (text) => renderTone(text.split(' ').slice(0, 1).join(' '));
    const run = speak({ render: endsEarly });
    await run.spoken.finished;
    expect(run.sent.filter(({ message }) => message.type === 'stop').map(({ isUrgent }) => isUrgent)).toEqual([true]);
  });

  it('keeps word times and audio together on a fake of the ElevenLabs wire, where they arrive in one message', async () => {
    wire = await startFakeElevenLabsWire({ leadingSilenceMs: LEADING_SILENCE_MS });
    const voice = makeElevenLabsVoice({ name: 'wire', apiKey: 'fake', voiceId: 'fake-voice', baseURL: wire.baseURL }).makeTts();
    const run = speak({ voice });
    await run.spoken.finished;
    await voice.close();
    const words = run.getMessages('words').flatMap((batch) => batch.words);
    expect(words).toHaveLength(6);
    expect(words[0]?.startMs).toBe(0);
    expect(words[1]?.startMs).toBeLessThanOrEqual(240);
    expect(run.captured[0]?.sampleRate).toBe(FAKE_SAMPLE_RATE);
  });
});
