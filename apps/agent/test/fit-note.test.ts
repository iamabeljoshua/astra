import { describe, expect, it } from 'vitest';
import type { MemoryLine } from '../src/learner-record/memory-note.ts';
import { makeFakeTutorModel } from '../src/providers/fake-model.ts';
import { createTutorBrain } from '../src/tutor/brain.ts';
import { PROMPT_VERSIONS, TUTOR_PROMPT } from '../src/tutor/prompt.ts';
import { PROMPT_V2 } from '../src/tutor/prompts/v2.ts';

const struggled: MemoryLine = { kind: 'struggled', about: 'the sign', days_ago: 2, known_from: 'checked_on_board' };
const caresAbout: MemoryLine = { kind: 'cares_about', about: 'baking bread', days_ago: 2, known_from: 'their_words' };

async function getFitNoteTurns(notes: MemoryLine[] | null, { turns = 3 } = {}) {
  const model = makeFakeTutorModel(() => ({ pieces: ['Fair enough, carry on.'] }));
  const brain = createTutorBrain({ model, ...(notes ? { memory: { memory: { count: notes.length, notes } } } : {}) });
  for (let turn = 0; turn < turns; turn += 1) for await (const beat of brain.reply({ text: 'can we do equations?' }, new AbortController().signal)) void beat;
  return model.requests.map(({ turns: sent }) => {
    const lastStudentTurn = sent.findLastIndex((entry) => entry.role === 'user');
    return JSON.stringify(sent.slice(lastStudentTurn)).includes('"fit"') || JSON.stringify(sent.slice(lastStudentTurn)).includes('\\"fit\\"');
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

describe('the prompt versions', () => {
  it('teaches on the personal prompt, and keeps the one before it to compare', () => {
    expect(TUTOR_PROMPT.system).toContain('# Teaching this student');
    expect(PROMPT_VERSIONS.v2.system).toBe(PROMPT_V2);
    expect(PROMPT_V2).not.toContain('# Teaching this student');
  });

  it('keeps safety and being right after the personal section, whole', () => {
    const { system } = TUTOR_PROMPT;
    const safety = PROMPT_V2.slice(PROMPT_V2.indexOf('# Being right'));
    expect(system.endsWith(safety)).toBe(true);
    expect(system.indexOf('# Teaching this student')).toBeLessThan(system.indexOf('# Staying safe'));
  });
});
