import { type Beat, parseBeat } from '@astra/contracts';
import { describe, expect, it, vi } from 'vitest';
import { BeatTextReader } from '../src/tutor/beat-text-reader.ts';
import { EMPTY_BOARD, getPictureProblem } from '../src/tutor/board-memory.ts';
import { createTutorBrain, type TutorBeat } from '../src/tutor/brain.ts';
import { createSpendCaps } from '../src/tutor/make-brain.ts';
import { TUTOR_SYSTEM, TUTOR_SYSTEM_WITH_SCENES } from '../src/tutor/prompt.ts';
import type { ModelEvent, TutorModelAdapter, TutorModelRequest } from '../src/providers/types.ts';

const USAGE = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };

function makeModel(...replies: string[]) {
  const requests: TutorModelRequest[] = [];
  const model: TutorModelAdapter = {
    name: 'fake',
    warm: async () => {},
    getCostUsd: () => 0,
    compact: async () => null,
    async *stream(request: TutorModelRequest): AsyncGenerator<ModelEvent> {
      requests.push(request);
      yield { type: 'started', usage: USAGE };
      yield { type: 'text', text: replies.shift() ?? 'Okay, carrying on.', isNewBlock: false };
      yield { type: 'finished', usage: USAGE, stopReason: 'finished', refusalCategory: null };
    },
  } as unknown as TutorModelAdapter;
  return { model, requests };
}

const read = async (beats: AsyncIterable<TutorBeat>) => {
  const said: TutorBeat[] = [];
  for await (const beat of beats) said.push(beat);
  return said;
};

const words = (beats: readonly Beat[]) => beats.flatMap((beat) => beat.script.filter((part) => typeof part === 'string')).join('');

describe('the reader', () => {
  const makeReader = (onAskScene?: (topic: string) => void) => {
    const refused: string[] = [];
    const beats: unknown[] = [];
    const reader = new BeatTextReader({ onBeatEnd: (beat) => void beats.push(beat), onBadCommand: (problem) => void refused.push(problem), onWrongMath: () => {}, ...(onAskScene ? { onAskScene } : {}) });
    return { reader, refused, beats };
  };

  it('takes a scene ask out of the words, and never holds them for it', () => {
    const asked: string[] = [];
    const { reader, refused, beats } = makeReader((topic) => void asked.push(topic));
    reader.push('{"kind":"askScene","topic":"what the slope of a line tells you"}So slope, think of a hill.');
    reader.finish();
    expect(asked).toEqual(['what the slope of a line tells you']);
    expect(refused).toEqual([]);
    expect(JSON.stringify(beats)).toContain('So slope');
    expect(JSON.stringify(beats)).not.toContain('askScene');
  });

  it('refuses the command in a session with no scenes, as any unknown command is', () => {
    const { reader, refused } = makeReader();
    reader.push('{"kind":"askScene","topic":"slope"}So slope, think of a hill.');
    reader.finish();
    expect(refused).toHaveLength(1);
  });
});

describe('words about a picture that is not there', () => {
  it.each(["I'll show you a picture of that", 'The animation is on its way', 'A scene is loading now', 'Let me pull up a video', "Here, watch this animation", 'Look at the picture on the right', 'The picture will appear in a moment'])('are stopped: %s', (text) => {
    expect(getPictureProblem(text, EMPTY_BOARD)).toMatch(/none is/);
  });

  it.each(["I'll draw it for you", 'Let me draw that on the board', 'Picture a ball rolling down a hill', 'Think of it as a picture in your head', 'That word is in the video game sense', 'The balcony scene is coming up next in the play', 'In that scene, the ghost will appear to him'])('are fine: %s', (text) => {
    expect(getPictureProblem(text, EMPTY_BOARD)).toBeNull();
  });

  it('are fine once a scene is on screen', () => {
    const memory = { ...EMPTY_BOARD, kinds: new Map([['scene-1', 'richScene']]) };
    expect(getPictureProblem('Look at the picture on the right', memory as never)).toBeNull();
  });
});

describe('the brain', () => {
  it('keeps the ordinary prompt for a session without scenes', async () => {
    const { model, requests } = makeModel('Okay, let us go.');
    await read(createTutorBrain({ model }).reply({ text: 'hello' }, new AbortController().signal));
    expect(requests[0]?.system).toBe(TUTOR_SYSTEM);
    expect(TUTOR_SYSTEM).not.toContain('askScene');
    expect(TUTOR_SYSTEM_WITH_SCENES.startsWith(TUTOR_SYSTEM)).toBe(true);
  });

  it('passes the ask on and still speaks at once', async () => {
    const { model } = makeModel('{"kind":"askScene","topic":"slope of a line"}So slope, think of a hill.');
    const onAskScene = vi.fn();
    const said = await read(createTutorBrain({ model, system: TUTOR_SYSTEM_WITH_SCENES, onAskScene }).reply({ text: 'what is slope' }, new AbortController().signal));
    expect(onAskScene).toHaveBeenCalledWith('slope of a line');
    expect(words(said)).toContain('So slope');
  });

  it('retries a reply that promises a picture, and the student never hears the promise', async () => {
    const { model, requests } = makeModel("I'll show you a picture of that.", 'So slope, think of a hill.');
    const said = await read(createTutorBrain({ model, system: TUTOR_SYSTEM_WITH_SCENES, onAskScene: () => {} }).reply({ text: 'what is slope' }, new AbortController().signal));
    expect(requests).toHaveLength(2);
    expect(words(said)).not.toMatch(/picture/);
    expect(words(said)).toContain('So slope');
  });

  it('leaves a session with no scenes as it was, whatever it says about a picture', async () => {
    const { model, requests } = makeModel("I'll show you a picture of that.");
    const said = await read(createTutorBrain({ model }).reply({ text: 'what is slope' }, new AbortController().signal));
    expect(requests).toHaveLength(1);
    expect(words(said)).toContain('picture');
  });

  it('tells the next turn what is on screen and what was said over it', async () => {
    const { model, requests } = makeModel('Okay, what do you think?', 'Right, and a steeper one?');
    const brain = createTutorBrain({ model });
    await read(brain.reply({ text: 'first' }, new AbortController().signal));
    const parsed = parseBeat({ id: 'n1-scene-setup', script: [{ kind: 'richScene', id: 'scene-1', engine: 'manimgx', sceneId: 'slope-1a2b3c4d', moments: { a: 1 }, parts: [], durationSeconds: 5 }, 'Watch the line tilt.'], expectsReply: false });
    if (!parsed.ok) throw new Error(parsed.problem);
    brain.noteSceneTurn?.({ topic: 'slope of a line', beats: [parsed.value] });
    brain.notePlayed?.({ beatId: parsed.value.id, playedWords: 4, firedCues: 1 });
    await read(brain.reply({ text: 'I see', }, new AbortController().signal));
    const notes = JSON.stringify(requests[1]?.turns);
    expect(notes).toContain('scene_on_screen');
    expect(notes).toContain('Watch the line tilt.');
    expect(brain.getBoard?.()).toBeDefined();
    expect(notes).toContain('richScene');
  });
});

describe('scene spending', () => {
  const makeCaps = (reportSpend = vi.fn(async () => ({ isOverDailyLimit: false }))) => ({ reportSpend, caps: createSpendCaps({ link: { reportSpend }, ledger: null, trace: () => {}, sessionLimitUsd: 1, sessionVoiceLimitCharacters: 1000 }) });

  it('counts against the student for the day', async () => {
    const { caps, reportSpend } = makeCaps();
    caps.addScene(0.15);
    await caps.flush();
    expect(reportSpend).toHaveBeenCalledWith(0.15);
    expect(caps.getSceneUsd()).toBe(0.15);
    expect(caps.getSpentUsd()).toBe(0.15);
  });

  it('charges a shared scene\'s words to the project ceiling, not to this student or this room', async () => {
    const reportSpend = vi.fn(async () => ({ isOverDailyLimit: false }));
    const charge = vi.fn();
    const caps = createSpendCaps({ link: { reportSpend }, ledger: { charge, isOverModelLimit: () => false, isOverVoiceLimit: () => false } as never, trace: () => {}, sessionLimitUsd: 1, sessionVoiceLimitCharacters: 100 });
    caps.addSharedVoice(300, "maya");
    await caps.flush();
    expect(charge).toHaveBeenCalledWith({ anthropicUsd: 0, voiceCharacters: 300, sharedPlayBy: 'maya' });
    expect(reportSpend).not.toHaveBeenCalled();
    expect(caps.getSpendLimit()).toBeNull();
    expect(caps.getSpentUsd()).toBe(0);
  });

  it('never closes the tutor for this room', () => {
    const { caps } = makeCaps();
    caps.addScene(5);
    expect(caps.getSpendLimit()).toBeNull();
  });

  it('a student past the day limit gets the tutor closed by the next report, as with any spend', async () => {
    const { caps } = makeCaps(vi.fn(async () => ({ isOverDailyLimit: true })));
    caps.addScene(0.15);
    await caps.flush();
    expect(caps.getSpendLimit()).toBe('dailyLimit');
  });
});
