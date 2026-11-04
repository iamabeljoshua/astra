import { RENDERED_SAMPLE_RATE, type RenderSpeech } from './rendered-voice.ts';

export const FAKE_SAMPLE_RATE = RENDERED_SAMPLE_RATE;
const WORD_MS = 280;
const LOUD = 0.5;
const QUIET = 0.05;
const TONE_HZ = 1000;
const LOUD_MS = 70;
const MS_PER_SECOND = 1000;

function renderWord(): Int16Array {
  const samples = Math.round((WORD_MS / MS_PER_SECOND) * FAKE_SAMPLE_RATE);
  const loudSamples = Math.round((LOUD_MS / MS_PER_SECOND) * FAKE_SAMPLE_RATE);
  return Int16Array.from({ length: samples }, (_, index) => Math.round((index < loudSamples ? LOUD : QUIET) * 32767 * Math.sin((2 * Math.PI * TONE_HZ * index) / FAKE_SAMPLE_RATE)));
}

export const renderTone: RenderSpeech = (text) => {
  const words = text.split(/\s+/).filter(Boolean);
  const pcm = new Int16Array(words.length * renderWord().length);
  const wordSamples = renderWord();
  words.forEach((_, index) => pcm.set(wordSamples, index * wordSamples.length));
  return { pcm, sampleRate: FAKE_SAMPLE_RATE, words: words.map((word, index) => ({ text: word, startMs: index * WORD_MS })) };
};

