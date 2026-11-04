import type { Beat } from '@astra/contracts';
import { parseBeat } from '@astra/contracts';
import { AudioFrame } from '@livekit/rtc-node';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';
import { createLessonVoice } from '../src/scenes/lesson/voice-takes.ts';
import { createSpendLedger } from '../src/scenes/spend-ledger.ts';

const RATE = 24000;
const makeBeat = (text: string): Beat => {
  const parsed = parseBeat({ id: 'line', script: [text], expectsReply: false });
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
};

function makeVoice({ studentLimit = 1000, totalLimit = Number.POSITIVE_INFINITY } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'voice-takes-'));
  const ledger = createSpendLedger(join(root, 'spend.jsonl'), { limitUsd: 5, studentLimitUsd: 5, voiceCharacterLimit: totalLimit, studentVoiceCharacterLimit: studentLimit });
  const liveTts = makeRenderedVoice({ name: 'live', render: renderTone }).makeTts();
  const makeLiveTts = vi.fn(() => liveTts);
  return { root, ledger, makeLiveTts, liveTts, voice: createLessonVoice({ root, voiceName: 'chris', makeLiveTts, ledger }) };
}

const makeFrame = (ms: number) => {
  const samples = Math.round((ms / 1000) * RATE);
  return new AudioFrame(new Int16Array(samples).fill(1000), RATE, 1, samples);
};
const WORDS = [{ text: 'Three', startMs: 0 }, { text: 'whole', startMs: 400 }, { text: 'words', startMs: 800 }];
const untilWritten = (root: string) => vi.waitFor(() => expect(readdirSync(join(root, 'voice')).filter((name) => name.endsWith('.json'))).toHaveLength(1));
const listTakes = (root: string) => (existsSync(join(root, 'voice')) ? readdirSync(join(root, 'voice')).filter((name) => name.endsWith('.json')) : []);

describe('saving a spoken line', () => {
  it('saves a line whose audio runs past its last word, and plays it back with no live voice', async () => {
    const { root, voice, makeLiveTts } = makeVoice();
    const turn = voice.forStudent('maya').forTurn([makeBeat('Three whole words')]);
    turn.onFrame?.(makeFrame(1300));
    turn.onWords?.(WORDS);
    turn.save?.();
    await untilWritten(root);
    makeLiveTts.mockClear();
    const again = voice.forStudent('tola').forTurn([makeBeat('Three whole words')]);
    expect(again.save).toBeUndefined();
    expect(makeLiveTts).not.toHaveBeenCalled();
  });

  it('refuses audio that stops before its last word, as a tab closed mid-sentence leaves it', async () => {
    const { root, voice } = makeVoice();
    const turn = voice.forStudent('maya').forTurn([makeBeat('Three whole words')]);
    turn.onFrame?.(makeFrame(500));
    turn.onWords?.(WORDS);
    turn.save?.();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(listTakes(root)).toEqual([]);
  });

  it('refuses a take with fewer words than its line', async () => {
    const { root, voice } = makeVoice();
    const turn = voice.forStudent('maya').forTurn([makeBeat('Three whole words')]);
    turn.onFrame?.(makeFrame(1300));
    turn.onWords?.(WORDS.slice(0, 2));
    turn.save?.();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(listTakes(root)).toEqual([]);
  });
});

describe('the voice cap', () => {
  it('is per student, so one student past it cannot turn another student\'s tutor into a tone', () => {
    const { voice, liveTts } = makeVoice({ studentLimit: 40 });
    const line = 'A line of well over twenty characters.';
    expect(voice.forStudent('maya').forTurn([makeBeat(line)]).tts).toBe(liveTts);
    expect(voice.forStudent('maya').forTurn([makeBeat(`${line} Again`)]).tts).not.toBe(liveTts);
    expect(voice.forStudent('tola').forTurn([makeBeat(line)]).tts).toBe(liveTts);
  });

  it('writes what it spends to the ledger, so a restart does not reset it', () => {
    const { root, voice, ledger } = makeVoice({ studentLimit: 40 });
    voice.forStudent('maya').forTurn([makeBeat('A line of well over twenty characters.')]);
    expect(ledger.read('maya').voiceCharacters).toBeGreaterThan(20);
    const afterRestart = createLessonVoice({ root, voiceName: 'chris', makeLiveTts: () => makeRenderedVoice({ name: 'live', render: renderTone }).makeTts(), ledger });
    expect(afterRestart.forStudent('maya').forTurn([makeBeat('A second line of well over twenty characters.')]).save).toBeUndefined();
  });
});

describe('where a spoken line is kept', () => {
  const OWN = { kind: 'student', sceneId: 'scene-abc' } as const;
  const say = async (voice: ReturnType<typeof makeVoice>['voice'], studentId: string, shelf: Parameters<ReturnType<typeof makeVoice>['voice']['forStudent']>[1]) => {
    const turn = voice.forStudent(studentId, shelf).forTurn([makeBeat('Three whole words')]);
    turn.onFrame?.(makeFrame(1300));
    turn.onWords?.(WORDS);
    turn.save?.();
    await new Promise((resolve) => setTimeout(resolve, 30));
    return turn;
  };
  const listFiles = (folder: string) => (existsSync(folder) ? readdirSync(folder, { recursive: true }).map(String).filter((name) => name.endsWith('.json')) : []);

  it('keeps a typed lesson\'s line under that student and that scene, and nowhere shared', async () => {
    const { root, voice } = makeVoice();
    await say(voice, 'maya', () => OWN);
    expect(listFiles(join(root, 'voice'))).toEqual([]);
    expect(listFiles(join(root, 'student-voice', 'maya', OWN.sceneId))).toHaveLength(1);
  });

  it('never plays one student\'s kept line to another, who pays for their own', async () => {
    const { voice, makeLiveTts } = makeVoice();
    await say(voice, 'maya', () => OWN);
    const again = voice.forStudent('tola', () => OWN).forTurn([makeBeat('Three whole words')]);
    expect(again.save).toBeDefined();
    expect(makeLiveTts).toHaveBeenCalled();
  });

  it('plays a student\'s own kept line back to them for free', async () => {
    const { voice } = makeVoice();
    await say(voice, 'maya', () => OWN);
    expect(voice.forStudent('maya', () => OWN).forTurn([makeBeat('Three whole words')]).save).toBeUndefined();
  });

  it('keeps a library card\'s line in the shared folder, where the next student gets it free', async () => {
    const { root, voice } = makeVoice();
    await say(voice, 'maya', () => ({ kind: 'shared' }));
    expect(listFiles(join(root, 'voice'))).toHaveLength(1);
    expect(voice.forStudent('tola', () => ({ kind: 'shared' })).forTurn([makeBeat('Three whole words')]).save).toBeUndefined();
  });

  it('keeps nothing for a typed lesson before it has a topic, and can still read a shared fixed line', async () => {
    const { root, voice } = makeVoice();
    await say(voice, 'maya', () => ({ kind: 'nowhere' }));
    expect(listFiles(root)).toEqual([]);
    await say(voice, 'tola', () => ({ kind: 'shared' }));
    expect(voice.forStudent('maya', () => ({ kind: 'nowhere' })).forTurn([makeBeat('Three whole words')]).save).toBeUndefined();
  });
});
