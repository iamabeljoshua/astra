import type { AudioFrame } from '@livekit/rtc-node';
import { type AgentMessage, type Beat, parseBeat, type TurnId } from '@astra/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { speakTurn, type SpeakTurnOptions } from '../src/live/speak-turn.ts';
import { makeElevenLabsVoice } from '../src/providers/elevenlabs.ts';
import { FAKE_SAMPLE_RATE, makeRenderedVoice, type RenderSpeech, renderTone } from '../src/providers/fakes.ts';
import { type FakeWire, startFakeElevenLabsWire } from './fake-elevenlabs-wire.ts';

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
    output: {
      captureFrame: async (frame) => {
        if (isStopped) framesAfterStop += 1;
        captured.push(frame);
        // A real source takes frames as fast as its queue allows, so this stands in for that pace.
        await delay(1);
      },
      clearQueue: () => (queueClears += 1),
      waitForPlayout: async () => {},
    },
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
