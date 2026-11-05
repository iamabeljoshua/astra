import { type AgentMessage, type Beat, parseBeat, type TurnId } from '@astra/contracts';
import { initializeLogger } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { speakTurn, type SpokenTurn } from '../src/live/speak-turn.ts';
import { createVoiceLine } from '../src/live/voice-line.ts';
import { makeRenderedVoice, RENDERED_SAMPLE_RATE, type RenderSpeech } from '../src/providers/rendered-voice.ts';

initializeLogger({ pretty: false, level: 'silent' });

const WORD_MS = 250;
const LOUD_MS = 200;
/** The real voice leaves 275 to 900 ms between sentences, and this sits near the short end. */
const SENTENCE_QUIET_MS = 300;
const SOURCE_QUEUE_MS = 200;
const ENDS_A_SENTENCE = /[.!?]$/;

const toSamples = (ms: number) => Math.round((ms / 1000) * RENDERED_SAMPLE_RATE);

const renderWithQuiet: RenderSpeech = (text) => {
  const words: { text: string; startMs: number }[] = [];
  let atMs = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    words.push({ text: word, startMs: atMs });
    atMs += WORD_MS + (ENDS_A_SENTENCE.test(word) ? SENTENCE_QUIET_MS : 0);
  }
  const pcm = new Int16Array(toSamples(atMs));
  for (const { startMs } of words) pcm.fill(12000, toSamples(startMs), toSamples(startMs + LOUD_MS));
  return { pcm, sampleRate: RENDERED_SAMPLE_RATE, words };
};

function makeBeat(id: string, text: string): Beat {
  const parsed = parseBeat({ id, script: [text], expectsReply: false });
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
}

type Source = 'full' | 'justInTime';

function hearTurn(source: Source, onFrame: (turn: SpokenTurn) => void = () => {}) {
  let sentMs = 0;
  let isPlayedOut = false;
  let heardMs: number | null = null;
  const messages: AgentMessage[] = [];
  const queuedMs = () => (isPlayedOut || source === 'justInTime' ? 0 : Math.min(SOURCE_QUEUE_MS, sentMs));
  const turn: SpokenTurn = speakTurn({
    voice: makeRenderedVoice({ name: 'fake', render: renderWithQuiet }).makeTts(),
    turnId: 'turn-seam' as TurnId,
    beats: [makeBeat('one', 'just spinning. Each one pushes air down as it whips around.')],
    line: createVoiceLine({
      sampleRate: RENDERED_SAMPLE_RATE,
      captureFrame: async (frame) => {
        isPlayedOut = false;
        sentMs += (frame.samplesPerChannel / frame.sampleRate) * 1000;
        onFrame(turn);
      },
      clearQueue: () => {
        heardMs ??= sentMs - queuedMs();
      },
      waitForPlayout: async () => {
        isPlayedOut = true;
      },
    }),
    messenger: { send: (message) => messages.push(message), sendOnBothChannels: (message) => messages.push(message) },
  });
  return {
    async heard() {
      await turn.finished;
      const words = messages.flatMap((message) => (message.type === 'words' ? message.words : []));
      const nextSentenceAtMs = words.find((word) => word.text === 'Each')?.startMs;
      if (nextSentenceAtMs === undefined) throw new Error('the voice never timed the next sentence');
      return { heardMs: heardMs ?? sentMs, nextSentenceAtMs, wordsSent: turn.getWordsSent().get('one' as Beat['id']), stops: messages.filter((message) => message.type === 'stop').length };
    },
  };
}

describe('a turn asked to end for a scene', () => {
  for (const source of ['full', 'justInTime'] as const) {
    it(`ends inside the quiet after its sentence, and counts only what went out, when the source is ${source}`, async () => {
      const { heardMs, nextSentenceAtMs, wordsSent, stops } = await hearTurn(source, (turn) => turn.endAtSentence()).heard();
      expect(heardMs).toBeLessThanOrEqual(nextSentenceAtMs - 100);
      expect(heardMs).toBeGreaterThan(nextSentenceAtMs - SENTENCE_QUIET_MS);
      expect(wordsSent).toBe(2);
      expect(stops).toBe(1);
    });
  }

  it('says every word when nothing asks it to end', async () => {
    const { wordsSent, stops } = await hearTurn('justInTime').heard();
    expect(wordsSent).toBe(11);
    expect(stops).toBe(0);
  });
});
