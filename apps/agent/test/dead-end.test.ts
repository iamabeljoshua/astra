import { getCues, type Beat, getBeatText } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { type FakeReply, makeFakeTutorModel } from '../src/providers/fake-model.ts';
import type { TutorModelRequest } from '../src/providers/types.ts';
import { createTutorBrain } from '../src/tutor/brain.ts';
import { TUTOR_PROMPT } from '../src/tutor/prompt.ts';
import { SPOKEN_LINES } from '../src/tutor/spoken-lines.ts';

const QUICK = { firstTextMs: 1200, betweenTextMs: 800, finishGraceMs: 20, reportWaitMs: 30 };
const MISSED = '{"attempt":"missed"}';
const GOT = '{"attempt":"got"}';
const SHOW_STEP = '{"kind":"writeMath","id":"steps","tex":"2x = 8","claim":"new"}';

function setup(getReply: (request: TutorModelRequest, attempt: number) => FakeReply) {
  const model = makeFakeTutorModel(getReply);
  const brain = createTutorBrain({ model, timeouts: QUICK, prompt: { ...TUTOR_PROMPT, turnNote: null } });
  return { model, brain };
}

async function collect(brain: ReturnType<typeof setup>['brain'], text: string): Promise<Beat[]> {
  const beats: Beat[] = [];
  for await (const beat of brain.reply({ text }, new AbortController().signal)) beats.push(beat);
  return beats;
}

const say = (beats: readonly Beat[]) => beats.map(getBeatText).join(' ');
const lastRequestHasNote = (model: ReturnType<typeof setup>['model'], name: string) => {
  const turns = model.requests.at(-1)?.turns ?? [];
  return JSON.stringify(turns.slice(turns.findLastIndex((turn) => turn.role === 'user'))).includes(name);
};

describe('two misses on one point', () => {
  it('holds a third question, asks again, and the student sees the step', async () => {
    const replies: FakeReply[] = [
      { pieces: ['Okay, have a go. What comes off first?'] },
      { pieces: ['Not quite. ', MISSED, 'What undoes the plus?'] },
      { pieces: ['Hmm, not that. ', MISSED, 'What undoes the plus three?'] },
      { pieces: ['Here it is. ', SHOW_STEP, 'Take three from both sides, so two x is eight.'] },
    ];
    const { brain, model } = setup(() => replies.shift() as FakeReply);
    await collect(brain, 'solve 2x + 3 = 11');
    await collect(brain, 'add 3?');
    const third = await collect(brain, 'times by 3?');
    expect(say(third)).not.toMatch(/\?/);
    expect(say(third)).toContain('Take three from both sides');
    expect(third.flatMap((beat) => getCues(beat)).map((cue) => cue.command.kind)).toContain('writeMath');
    expect(lastRequestHasNote(model, 'already missed twice')).toBe(true);
  });

  it('lets a question through once the step is on the board, because it is a new point', async () => {
    const replies: FakeReply[] = [
      { pieces: ['Have a go at it. What first?'] },
      { pieces: ['Not quite. ', MISSED, 'What undoes the plus?'] },
      { pieces: ['Let me show you. ', MISSED, SHOW_STEP, 'That leaves two x equals eight. So what is x?'] },
    ];
    const { brain } = setup(() => replies.shift() as FakeReply);
    await collect(brain, 'solve it');
    await collect(brain, 'add 3?');
    const third = await collect(brain, 'times by 3?');
    expect(third.at(-1)?.expectsReply).toBe(true);
    expect(say(third)).toContain('So what is x?');
  });

  it('tells the model on the next message, from code, how many it has missed', async () => {
    const replies: FakeReply[] = [
      { pieces: ['Have a go at it. What first?'] },
      { pieces: ['Not quite. ', MISSED, 'What undoes the plus?'] },
      { pieces: ['Okay then.'] },
    ];
    const { brain, model } = setup(() => replies.shift() as FakeReply);
    await collect(brain, 'solve it');
    await collect(brain, 'add 3?');
    expect(lastRequestHasNote(model, 'missed_once')).toBe(false);
    await collect(brain, 'times by 3?');
    expect(lastRequestHasNote(model, 'missed_once')).toBe(true);
  });

  it('counts a student who says they do not know, even when the model reports nothing', async () => {
    const replies: FakeReply[] = [
      { pieces: ['Have a go at it. What first?'] },
      { pieces: ['No problem at all. Which side has the three?'] },
      { pieces: ['Again, which side?'] },
      { pieces: ['Here it is. ', SHOW_STEP, 'Take three from both sides.'] },
    ];
    const { brain, model } = setup(() => replies.shift() as FakeReply);
    await collect(brain, 'solve it');
    await collect(brain, 'i dont know');
    const third = await collect(brain, 'idk');
    expect(lastRequestHasNote(model, 'dead_end')).toBe(true);
    expect(say(third)).toContain('Take three from both sides');
  });

  it('does not count "i dont know" when nothing was asked', async () => {
    const { brain, model } = setup(() => ({ pieces: ['Fine, so that is the idea.'] }));
    await collect(brain, 'i dont know what to learn');
    await collect(brain, 'i dont know');
    expect(lastRequestHasNote(model, 'missed_once')).toBe(false);
  });

  it('starts the count again after a got, and after a turn with no miss', async () => {
    const replies: FakeReply[] = [
      { pieces: ['Have a go at it. What first?'] },
      { pieces: ['Not quite. ', MISSED, 'What undoes the plus?'] },
      { pieces: ['Yes. ', GOT, 'What next?'] },
      { pieces: ['Not quite. ', MISSED, 'What about the two?'] },
    ];
    const { brain, model } = setup(() => replies.shift() as FakeReply);
    await collect(brain, 'solve it');
    await collect(brain, 'add 3?');
    await collect(brain, 'take 3');
    const fourth = await collect(brain, 'times by 2?');
    expect(lastRequestHasNote(model, 'dead_end')).toBe(false);
    expect(say(fourth)).toContain('What about the two?');
  });

  it('says a plain line if the model will not stop asking, so the student never hears the third question', async () => {
    const replies: FakeReply[] = [
      { pieces: ['Have a go at it. What first?'] },
      { pieces: ['Not quite. ', MISSED, 'What undoes the plus?'] },
    ];
    const { brain } = setup(() => replies.shift() ?? { pieces: ['Not quite. ', MISSED, 'Again, what undoes the plus?'] });
    await collect(brain, 'solve it');
    await collect(brain, 'add 3?');
    const third = await collect(brain, 'times by 3?');
    expect(say(third)).not.toContain('what undoes');
    expect(say(third)).toContain(SPOKEN_LINES.stuckHandBack[0]);
  });

  it('never holds a question in a safety reply, at a dead end or not', async () => {
    const replies: FakeReply[] = [
      { pieces: ['Have a go at it. What first?'] },
      { pieces: ['Not quite. ', MISSED, 'What undoes the plus?'] },
      { pieces: ['That sounds serious. Please tell an adult you trust now. Are you safe?'] },
    ];
    const { brain, model } = setup(() => replies.shift() as FakeReply);
    await collect(brain, 'solve it');
    await collect(brain, 'add 3?');
    const third = await collect(brain, 'i dont know, i want to hurt myself');
    expect(say(third)).toContain('Are you safe?');
    expect(model.requests).toHaveLength(3);
  });

  it('lets a gentle question through when the message may be about safety, even with no safety words in it', async () => {
    const replies: FakeReply[] = [
      { pieces: ['Have a go at it. What first?'] },
      { pieces: ['Not quite. ', MISSED, 'What undoes the plus?'] },
      { pieces: ['That sounds hard. ', MISSED, 'Do you have someone with you right now?'] },
    ];
    const { brain, model } = setup(() => replies.shift() as FakeReply);
    await collect(brain, 'solve it');
    await collect(brain, 'add 3?');
    const third = await collect(brain, 'i dont know if i want to be alive anymore');
    expect(say(third)).toContain('Do you have someone with you right now?');
    expect(say(third)).not.toContain(SPOKEN_LINES.stuckHandBack[0]);
    expect(model.requests).toHaveLength(3);
  });

  it('hears a student who is stuck, whichever apostrophe their keyboard types', async () => {
    const { brain, model } = setup((_request, attempt) => (attempt === 1 ? { pieces: ['Have a go at it. What first?'] } : { pieces: ['Here it is. ', SHOW_STEP, 'Two x is eight.'] }));
    await collect(brain, 'solve it');
    await collect(brain, 'I don\u2019t know');
    expect(lastRequestHasNote(model, 'missed_once')).toBe(true);
  });
});
