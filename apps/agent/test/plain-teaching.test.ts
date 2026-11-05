import { getBeatText } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { withoutFillerOpener } from '../src/lesson-plan/lesson-rules.ts';
import { getTutorVoiceRules } from '../src/providers/anthropic.scenes.ts';
import { makeFakeTutorModel } from '../src/providers/fake-model.ts';
import type { SafetyWatch } from '../src/safety/safety-watch.ts';
import type { StudentReading } from '../src/safety/student-reading.ts';
import { createTutorBrain, type TurnSummary } from '../src/tutor/brain.ts';
import { PROMPT_VERSIONS, TUTOR_PROMPT } from '../src/tutor/prompt.ts';
import { STAYING_SAFE_V2 } from '../src/tutor/prompts/staying-safe-v2.ts';

const STILL_MS = 20;

async function reply(words: string, reading: StudentReading, safetyWords = false) {
  const model = makeFakeTutorModel(() => ({ pieces: safetyWords ? ['[laughs] Please tell an adult you trust now.'] : ['[lau', 'ghs] That is a lot ', 'of drama. [chuckles] Air ', 'pushes back.'] }));
  const safety: SafetyWatch = { readStudent: async () => reading, noteTurnEnd: () => {}, showHelp: () => {}, showHelpIfRaised: () => {}, readSession: async () => 'none', flush: async () => {} };
  const summaries: TurnSummary[] = [];
  const brain = createTutorBrain({ model, safety, onTurnEnd: (summary) => summaries.push(summary) });
  const beats = [];
  for await (const beat of brain.reply({ text: words }, new AbortController().signal)) {
    beats.push(beat);
    await new Promise((done) => setTimeout(done, STILL_MS));
  }
  return { beats, spoken: summaries.at(-1)?.spokenText ?? '' };
}

describe('voice tags', () => {
  it('leaves the tag out of every word, and keeps it for the voice on a line read clean', async () => {
    const { beats, spoken } = await reply('why does it fly', 'none');
    const words = beats.map(getBeatText).join(' ');
    expect(words).toBe('That is a lot of drama. Air pushes back.');
    expect(spoken).toBe(words);
    expect(beats.flatMap((beat) => beat.voiceTags ?? []).map(({ tag }) => tag)).toEqual(['[laughs]', '[chuckles]']);
  });

  it('never lets a line read as danger laugh', async () => {
    const { beats, spoken } = await reply('i want to die', 'self_harm');
    expect(spoken).toMatch(/adult you trust/);
    expect(spoken).not.toMatch(/\[|laughs/);
    expect(beats.flatMap((beat) => beat.voiceTags ?? [])).toEqual([]);
  });

  it('never lets a reply that names help laugh, even on a clean read', async () => {
    const { beats, spoken } = await reply('why does it fly', 'none', true);
    expect(spoken).toBe('Please tell an adult you trust now.');
    expect(beats.flatMap((beat) => beat.voiceTags ?? [])).toEqual([]);
  });

  it('speaks other brackets as words, with no tag', async () => {
    const model = makeFakeTutorModel(() => ({ pieces: ['So [sighs] it ', 'falls down.'] }));
    const brain = createTutorBrain({ model });
    const beats = [];
    for await (const beat of brain.reply({ text: 'go on' }, new AbortController().signal)) beats.push(beat);
    expect(beats.map(getBeatText).join(' ')).toBe('So sighs it falls down.');
    expect(beats.flatMap((beat) => beat.voiceTags ?? [])).toEqual([]);
  });
});

describe('plain teaching', () => {
  it('leaves Staying safe word for word', () => {
    expect(TUTOR_PROMPT.system).toContain(STAYING_SAFE_V2);
    expect(PROMPT_VERSIONS.v5.system).toContain(STAYING_SAFE_V2);
    expect(PROMPT_VERSIONS.v5FindSource.system).toContain(STAYING_SAFE_V2);
  });

  it.each(['middle_school', 'high_school', 'university', 'out_of_school'])('starts a student at %s plain', (level) => {
    expect(TUTOR_PROMPT.levelLines?.[level]).toMatch(/^Start plain/);
  });

  it('shows a high schooler the formula after the picture, one at a time', () => {
    expect(TUTOR_PROMPT.levelLines?.high_school).toContain('formula on the board');
    expect(TUTOR_PROMPT.system).toContain('One formula per idea');
    expect(TUTOR_PROMPT.system).toContain('never in place of it');
  });

  it('asks for no proper terms at the start, at any level', () => {
    expect(TUTOR_PROMPT.system).not.toMatch(/proper terms straight away|never a childhood picture|proper term and the mechanism in every reply/);
    expect(TUTOR_PROMPT.system).toContain('Everyone starts plain.');
  });

  it('gives a fast scene the same plain rules and humor, read from the live prompt', () => {
    const rules = getTutorVoiceRules(TUTOR_PROMPT.system);
    expect(rules).toContain('Tiny everyday words');
    expect(rules).toContain('small joke');
    expect(rules).toContain('never about them');
  });

  it('keeps jokes out of anything in Staying safe', () => {
    expect(TUTOR_PROMPT.system).toContain('No joke on anything in Staying safe');
    expect(TUTOR_PROMPT.turnNote?.length).toContain('no joke');
  });

  it.each([
    ['Here is the part that surprises people. The blades are wings.', 'The blades are wings.'],
    ["Here's a puzzle. The blades are wings.", 'The blades are wings.'],
    ['So here is the clever bit: the blades are wings.', 'The blades are wings.'],
  ])('takes the teaser out of %s', (said, left) => {
    expect(withoutFillerOpener(said)).toBe(left);
  });
});
