import { describe, expect, it } from 'vitest';
import type { MemoryLine } from '../src/learner-record/memory-note.ts';
import { makeFakeTutorModel } from '../src/providers/fake-model.ts';
import type { TutorModelRequest } from '../src/providers/types.ts';
import { createTutorBrain } from '../src/tutor/brain.ts';
import { PROMPT_VERSIONS, TUTOR_PROMPT } from '../src/tutor/prompt.ts';
import { STAYING_SAFE_V2 } from '../src/tutor/prompts/staying-safe-v2.ts';
import { PROMPT_V2 } from '../src/tutor/prompts/v2.ts';

const struggled: MemoryLine = { kind: 'struggled', about: 'the sign', days_ago: 2, known_from: 'checked_on_board' };
const caresAbout: MemoryLine = { kind: 'cares_about', about: 'baking bread', days_ago: 2, known_from: 'their_words' };

async function getFitNoteTurns(notes: MemoryLine[] | null, { turns = 3 } = {}) {
  const model = makeFakeTutorModel(() => ({ pieces: ['Fair enough, carry on.'] }));
  const brain = createTutorBrain({ model, ...(notes ? { memory: { memory: { count: notes.length, notes } } } : {}) });
  for (let turn = 0; turn < turns; turn += 1) for await (const beat of brain.reply({ text: 'can we do equations?' }, new AbortController().signal)) void beat;
  return model.requests.map(({ turns: sent }) => {
    const lastStudentTurn = sent.findLastIndex((entry) => entry.role === 'user');
    return JSON.stringify(sent.slice(lastStudentTurn)).includes('\\"fit\\"');
  });
}

describe('the note on where to start', () => {
  it('goes with the opening turns of a student who showed or struggled, and then stops', async () => {
    expect(await getFitNoteTurns([struggled])).toEqual([true, true, false]);
  });

  it('never goes to a student with nothing on where to start', async () => {
    expect(await getFitNoteTurns(null)).toEqual([false, false, false]);
    expect(await getFitNoteTurns([])).toEqual([false, false, false]);
    expect(await getFitNoteTurns([caresAbout])).toEqual([false, false, false]);
  });
});

const CRISIS_REPLY = 'That sounds serious. Please tell an adult you trust now. Are you safe right now?';
const profile = { level: 'high_school', interests: ['cooking'], goal: 'class' };
const memory = { memory: { count: 2, notes: [caresAbout, struggled] } };

async function say(brain: ReturnType<typeof createTutorBrain>, text: string) {
  for await (const beat of brain.reply({ text }, new AbortController().signal)) void beat;
}

const getSent = (request: TutorModelRequest | undefined) => JSON.stringify(request?.turns ?? []);

describe('the reply after a safety reply', () => {
  it('holds neither their interests nor their memory, and keeps their own words', async () => {
    const replies = [CRISIS_REPLY, 'Sure, ratios compare amounts.'];
    const model = makeFakeTutorModel(() => ({ pieces: [replies.shift() ?? 'Fair enough, carry on.'] }));
    const brain = createTutorBrain({ model, profile, memory });

    await say(brain, "my mum's boyfriend hit me last night");
    await say(brain, 'ok. can you explain ratios');

    const sent = getSent(model.requests[1]);
    expect(sent).not.toContain('cooking');
    expect(sent).not.toContain('baking bread');
    expect(sent).not.toContain('the sign');
    expect(sent).not.toContain('\\"fit\\"');
    expect(sent).toContain('hit me last night');
    expect(sent).toContain('can you explain ratios');
    expect(sent).toContain(CRISIS_REPLY);
  });

  it('gives them back on the reply after that', async () => {
    const replies = [CRISIS_REPLY, 'Sure, ratios compare amounts.'];
    const model = makeFakeTutorModel(() => ({ pieces: [replies.shift() ?? 'Fair enough, carry on.'] }));
    const brain = createTutorBrain({ model, profile, memory });

    await say(brain, 'i want to hurt myself');
    await say(brain, 'ok. can you explain ratios');
    await say(brain, 'and another one?');

    const sent = getSent(model.requests[2]);
    expect(sent).toContain('cooking');
    expect(sent).toContain('baking bread');
  });

  it('holds back a note that loads late, for the reply after', async () => {
    const replies = [CRISIS_REPLY, 'Sure, ratios compare amounts.'];
    const model = makeFakeTutorModel(() => ({ pieces: [replies.shift() ?? 'Fair enough, carry on.'] }));
    let giveMemory: (loaded: typeof memory) => void = () => {};
    const loadMemory = () => new Promise<typeof memory>((resolve) => (giveMemory = resolve));
    const brain = createTutorBrain({ model, profile, loadMemory, timeouts: { profileWaitMs: 1 } });

    await say(brain, 'i want to hurt myself');
    giveMemory(memory);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await say(brain, 'ok. can you explain ratios');
    await say(brain, 'and another one?');

    expect(getSent(model.requests[1])).not.toContain('baking bread');
    expect(getSent(model.requests[2])).toContain('baking bread');
  });

  it('treats a message a safety check refused the same way', async () => {
    let asked = 0;
    const model = makeFakeTutorModel(() => {
      asked += 1;
      return asked === 1 ? { pieces: [], stopReason: 'refused', refusalCategory: 'general_harms' } : { pieces: ['Sure, ratios compare amounts.'] };
    });
    const brain = createTutorBrain({ model, profile, memory });

    await say(brain, 'something the check stopped');
    await say(brain, 'ok. can you explain ratios');

    const sent = getSent(model.requests[1]);
    expect(sent).not.toContain('cooking');
    expect(sent).not.toContain('baking bread');
    expect(sent).toContain('declined');
  });

  it('leaves an ordinary reply alone', async () => {
    const model = makeFakeTutorModel(() => ({ pieces: ['Sure, ratios compare amounts.'] }));
    const brain = createTutorBrain({ model, profile, memory });

    await say(brain, 'what is a ratio?');
    await say(brain, 'and another one?');

    const sent = getSent(model.requests[1]);
    expect(sent).toContain('cooking');
    expect(sent).toContain('baking bread');
  });
});

describe('the level line', () => {
  const getLevelNotes = (request: TutorModelRequest | undefined) => (request?.turns ?? []).flatMap((turn) => (turn.role === 'system' && turn.text.startsWith('{"level"') ? [JSON.parse(turn.text) as { level: string }] : []));

  it.each(['middle_school', 'high_school', 'university', 'out_of_school'])('goes with every turn at %s, in about 15 words', async (level) => {
    const model = makeFakeTutorModel(() => ({ pieces: ['Fair enough, carry on.'] }));
    const brain = createTutorBrain({ model, profile: { ...profile, level } });

    await say(brain, 'why does ice float?');
    await say(brain, 'not sure, go on');

    const [first, second] = model.requests.map(getLevelNotes);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    expect(first?.[0]?.level.split(/\s+/).length).toBeLessThanOrEqual(16);
  });

  it('differs for a university student and a middle schooler', async () => {
    const heard = await Promise.all(
      ['university', 'middle_school'].map(async (level) => {
        const model = makeFakeTutorModel(() => ({ pieces: ['Fair enough, carry on.'] }));
        await say(createTutorBrain({ model, profile: { ...profile, level } }), 'why does ice float?');
        return getLevelNotes(model.requests[0])[0]?.level;
      }),
    );
    expect(heard[0]).toBeTruthy();
    expect(heard[0]).not.toBe(heard[1]);
  });

  it('stays on the reply after a safety reply', async () => {
    const replies = [CRISIS_REPLY, 'Sure, ratios compare amounts.'];
    const model = makeFakeTutorModel(() => ({ pieces: [replies.shift() ?? 'Fair enough, carry on.'] }));
    const brain = createTutorBrain({ model, profile: { ...profile, level: 'university' } });

    await say(brain, 'i want to hurt myself');
    await say(brain, 'ok. can you explain ratios');

    expect(getLevelNotes(model.requests[1])).not.toEqual([]);
  });

  it('goes to no student whose level is not known', async () => {
    const model = makeFakeTutorModel(() => ({ pieces: ['Fair enough, carry on.'] }));
    await say(createTutorBrain({ model }), 'why does ice float?');
    expect(getLevelNotes(model.requests[0])).toEqual([]);
  });
});

describe('the prompt versions', () => {
  it('teaches on the personal prompt, and keeps the one before it to compare', () => {
    expect(TUTOR_PROMPT.system).toContain('# Teaching this student');
    expect(PROMPT_VERSIONS.v2.system).toBe(PROMPT_V2);
    expect(PROMPT_V2).not.toContain('# Teaching this student');
  });

  it('keeps safety and being right after the personal section, whole', () => {
    const { system } = TUTOR_PROMPT;
    const safety = PROMPT_V2.slice(PROMPT_V2.indexOf('# Being right'), PROMPT_V2.indexOf('# Notes you receive'));
    expect(system).toContain(safety);
    expect(system).toContain(STAYING_SAFE_V2);
    expect(system.indexOf('# Teaching this student')).toBeLessThan(system.indexOf('# Staying safe'));
  });
});
