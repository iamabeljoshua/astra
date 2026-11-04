import { describe, expect, it } from 'vitest';
import { createTakePicker, getTakeAudio, getTakeBeat, loadTakes, readTake, type StoredTake } from '../src/live/reactions.ts';
import { getBeatText, getSpokenWords } from '@astra/contracts';
import { AUDIBLE_SAMPLE } from '../src/live/first-sound.ts';

const makeTake = (id: string, phrase: string, use: StoredTake['use'] = 'reaction'): StoredTake => ({ id, use, phrase, sampleRate: 24000, words: [], base64: '' });

describe('the stored takes', () => {
  const takes = loadTakes();

  it('are all at 24 kHz, the one rate the voice line and the clock were proven on', () => {
    expect(takes.every((take) => take.sampleRate === 24000)).toBe(true);
    expect(() => readTake(JSON.stringify({ ...makeTake('old', 'Hm.'), sampleRate: 22050 }))).toThrow(/24000/);
  });

  it('carry their own word times, one per spoken word, rising from zero', () => {
    for (const take of takes) {
      const spoken = getSpokenWords(getBeatText(getTakeBeat(take, 'beat')));
      expect(take.words.map((word) => word.text)).toEqual(spoken);
      expect(take.words[0]?.startMs).toBe(0);
      expect(take.words.every((word, index) => index === 0 || word.startMs >= (take.words[index - 1]?.startMs ?? 0))).toBe(true);
    }
  });

  it('start on their first audible sample, because leading silence would spend the 200 ms', () => {
    for (const take of takes) expect(Math.abs(getTakeAudio(take).pcm[0] as number)).toBeGreaterThanOrEqual(AUDIBLE_SAMPLE);
  });

  it('run at least 250 ms, because a shorter first word right after a stop is given up as old audio', () => {
    for (const take of takes) expect((getTakeAudio(take).pcm.length / take.sampleRate) * 1000).toBeGreaterThanOrEqual(250);
  });

  it('never praise, because a reaction plays before the tutor has read a word', () => {
    expect(takes.filter((take) => /good|great|nice|well done/i.test(take.phrase)).map((take) => take.phrase)).toEqual([]);
    const picker = createTakePicker(takes);
    const picked = Array.from({ length: 24 }, () => picker.next('reaction')?.phrase);
    expect(new Set(picked).size).toBeGreaterThanOrEqual(3);
  });

  it('include several short reactions, the working phrase, and the lines the session needs', () => {
    const uses = (use: StoredTake['use']) => takes.filter((take) => take.use === use).length;
    expect(uses('reaction')).toBeGreaterThanOrEqual(3);
    expect(uses('working')).toBe(3);
    expect(uses('greeting')).toBe(1);
    expect(uses('prompt')).toBe(1);
    expect(uses('voiceLost')).toBe(1);
  });
});

describe('createTakePicker', () => {
  it('plays no phrase twice in three turns', () => {
    const picker = createTakePicker([makeTake('a', 'Hm.'), makeTake('b', 'Okay.'), makeTake('c', 'Right.')]);
    const phrases = Array.from({ length: 12 }, () => picker.next('reaction')?.phrase);
    phrases.forEach((phrase, index) => {
      if (index > 0) expect(phrase).not.toBe(phrases[index - 1]);
      if (index > 1) expect(phrase).not.toBe(phrases[index - 2]);
    });
  });

  it('counts versions of one phrase as that phrase', () => {
    const picker = createTakePicker([makeTake('a', 'Let me work that out.', 'working'), makeTake('b', 'Let me work that out.', 'working'), makeTake('c', 'Hm.', 'working'), makeTake('d', 'Okay.', 'working')]);
    const phrases = Array.from({ length: 8 }, () => picker.next('working')?.phrase);
    phrases.forEach((phrase, index) => {
      if (index > 0) expect(phrase).not.toBe(phrases[index - 1]);
    });
  });

  it('has nothing to say for a use with no takes', () => {
    expect(createTakePicker([]).next('reaction')).toBeNull();
  });
});
