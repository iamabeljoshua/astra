import { type Beat, getBeatText, getCues } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { type FakeReply, makeFakeTutorModel } from '../src/providers/fake-model.ts';
import type { TutorModelRequest } from '../src/providers/types.ts';
import { checkClaimedMath } from '../src/tutor/check-math.ts';
import { createTutorBrain, type TurnSummary, type TutorBeat } from '../src/tutor/brain.ts';
import { TUTOR_SYSTEM } from '../src/tutor/prompt.ts';
import { SPOKEN_LINES } from '../src/tutor/spoken-lines.ts';

const QUICK = { stillWorkingMs: 40, firstTextMs: 120, betweenTextMs: 80, finishGraceMs: 20, reportWaitMs: 30, checkingMathMs: 40 };

const write = (id: string, tex: string, claim?: string) => JSON.stringify({ kind: 'writeMath', id, tex: tex, ...(claim ? { claim } : {}) });
const rewrite = (target: string, tex: string, claim?: string) => JSON.stringify({ kind: 'transformMath', target, tex: tex, ...(claim ? { claim } : {}) });
const reply = (...pieces: string[]): FakeReply => ({ pieces });

function setup(getReply: (request: TutorModelRequest, attempt: number) => FakeReply, timeouts = QUICK) {
  const model = makeFakeTutorModel(getReply);
  const summaries: TurnSummary[] = [];
  const traces: string[] = [];
  const brain = createTutorBrain({ model, timeouts, onTurnEnd: (summary) => summaries.push(summary), trace: (name) => traces.push(name) });
  return { model, brain, summaries, traces };
}

async function collect(brain: ReturnType<typeof setup>['brain'], text: string): Promise<TutorBeat[]> {
  const beats: TutorBeat[] = [];
  for await (const beat of brain.reply({ text }, new AbortController().signal)) beats.push(beat);
  return beats;
}

const say = (beats: readonly Beat[]) => beats.map(getBeatText).join(' ');
const texOf = (beats: readonly Beat[]) => beats.flatMap((beat) => getCues(beat).map(({ command }) => ('tex' in command ? command.tex : command.kind)));
const stretchesOf = (beats: readonly TutorBeat[]) => {
  const stretches: string[][] = [[]];
  for (const beat of beats) {
    if (beat.pauseBeforeMs !== undefined) stretches.push([]);
    (stretches.at(-1) as string[]).push(getBeatText(beat));
  }
  return stretches.map((stretch) => stretch.join(' '));
};
const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;
const lastNote = (request: TutorModelRequest | undefined) => JSON.stringify(request?.turns.filter((turn) => turn.role === 'system'));

/** A line the tutor states, then a true lesson's next line, labelled the way the prompt teaches. */
const TRUE_LESSON_LINES: readonly (readonly [string, string, string, string])[] = [
  ['true calculus', 'x^2', '2x', 'relation'],
  ['true calculus', '3x^2 + 2x', '6x + 2', 'relation'],
  ['true calculus', '2x', 'x^2', 'relation'],
  ['a shifted curve', 'x^2', 'x^2 + 1', 'relation'],
  ['a shifted curve', 'x^2', '(x - 1)^2', 'relation'],
  ['a line divided through', '6x + 9', '2x + 3', 'relation'],
  ['a new problem', 'x + 1 = 2', 'x + 2 = 5', 'new'],
  ['the next root', 'x = 2', 'x = 3', 'new'],
  ['the other root', 'x = 3', 'x = -3', 'new'],
  ['a rounded constant', 'g = 9.8', 'g = 10', 'relation'],
  ['a rounded number', '47', '50', 'relation'],
  ['base 2', '1 + 1', '10', 'relation'],
  ['base 2', '101 + 11', '1000', 'relation'],
  ['a student line', '2x + 3 = 11', '2x = 14', 'shown'],
  ['a student line', '5x = 500', 'x = 200', 'shown'],
  ['a fake proof', '2b = b', '2 = 1', 'shown'],
];

describe('a line says what it is, and code checks only that', () => {
  it.each(TRUE_LESSON_LINES)('%s: %s then %s as %s is never wrong', (_why, before, after, claim) => {
    expect(checkClaimedMath(claim as 'step', before, after).status).not.toBe('wrong');
  });

  it.each(TRUE_LESSON_LINES)('%s: %s then %s with no claim is never wrong', (_why, before, after) => {
    expect(checkClaimedMath(undefined, before, after).status).not.toBe('wrong');
  });

  it.each([
    ['x^2', '2x'],
    ['x + 1 = 2', 'x + 2 = 5'],
    ['5x = 500', 'x = 200'],
    ['2x + 3 = 11', '2x = 14'],
  ])('still catches %s then %s when it is claimed as an equal step', (before, after) => {
    expect(checkClaimedMath('step', before, after).status).toBe('wrong');
  });

  it.each([['1 + 1 = 10'], ['7 + 8 = 3'], ['2 + 2 = 5'], ['9.8 \\times 2 = 19.7']])('calls %s wrong when it is written as true in base ten', (tex) => {
    expect(checkClaimedMath('new', undefined, tex).status).toBe('wrong');
    expect(checkClaimedMath('step', undefined, tex).status).toBe('wrong');
  });

  it.each([['1_2 + 1_2 = 10_2'], ['1 + 1 = 10_2'], ['101_2 + 11_2 = 1000_2'], ['13 = 1101_2'], ['7 + 8 = 3 \\pmod{12}'], ['7 + 8 \\equiv 3'], ['7 + 8 \\equiv 3 \\pmod{12}'], ['17 \\bmod 5 = 2']])('does not judge %s in base ten, because it names its own base or clock', (tex) => {
    expect(checkClaimedMath('new', undefined, tex).status).not.toBe('wrong');
    expect(checkClaimedMath('step', undefined, tex).status).not.toBe('wrong');
  });
});

describe('true lessons on the board', () => {
  it('lets the tutor rewrite x squared as its derivative, with no doubt', async () => {
    const { brain, model, traces } = setup(() => reply(`Yep, that's right. ${write('d', 'x^2', 'new')}Here's x squared. ${rewrite('d', '2x', 'relation')}And its derivative is two x.`));
    const beats = await collect(brain, 'i got 2x for the derivative of x squared. write x squared on the board then rewrite it as its derivative');
    expect(traces).not.toContain('mathRefused');
    expect(model.requests).toHaveLength(1);
    expect(texOf(beats)).toEqual(['x^2', '2x']);
    expect(say(beats)).not.toMatch(/check that|back that step/);
  });

  it('shows a student their own wrong line and marks it, and blames nobody at the app', async () => {
    const { brain, model, traces } = setup(() => reply(`Sure, here's yours. ${write('mine', '2x + 3 = 11', 'new')}You started here. ${rewrite('mine', '2x = 14', 'shown')}Then you wrote fourteen. {"kind":"annotate","id":"no","target":"mine","mark":"cross"}That's where it slipped.`));
    const beats = await collect(brain, 'i did 2x + 3 = 11, then 2x = 14, then x = 7. write what i did and show me where i went wrong');
    expect(traces).not.toContain('mathRefused');
    expect(model.requests).toHaveLength(1);
    expect(texOf(beats)).toEqual(['2x + 3 = 11', '2x = 14', 'annotate']);
    expect(say(beats)).not.toMatch(/back that step|won't guess|check that/);
  });

  it('never compares a right line to a wrong one that was only shown', async () => {
    const { brain, traces } = setup(() => reply(`Okay, look. ${write('a', '2x + 3 = 11', 'new')}Your start. ${write('b', '2x = 14', 'shown')}Your slip. ${write('c', '2x = 8', 'step')}The right line.`));
    await collect(brain, 'where did i go wrong');
    expect(traces).not.toContain('mathRefused');
  });

  it('treats a word it does not know as a claim it does not judge, and keeps the line', async () => {
    const { brain, traces } = setup(() => reply(`Okay, so. ${write('d', 'x^2', 'new')}Here it is. ${rewrite('d', '2x', 'derivative')}And there's its derivative.`));
    const beats = await collect(brain, 'derivative of x squared');
    expect(traces).not.toContain('mathRefused');
    expect(texOf(beats)).toEqual(['x^2', '2x']);
  });

  it('asks the prompt to say what a line is', () => {
    for (const claim of ['"claim":"step"', '"claim":"new"', '"claim":"shown"', '"claim":"relation"']) expect(TUTOR_SYSTEM).toContain(claim);
  });
});

describe('a claimed step that is certainly false', () => {
  it('holds the step and asks again without a word, when the answer comes quickly', async () => {
    const { brain, model } = setup((_request, attempt) => (attempt === 1 ? reply(`First, simple. ${write('s', '5x = 500', 'new')}Five x is five hundred. ${rewrite('s', 'x = 200', 'step')}So x is two hundred.`) : reply(`${rewrite('s', 'x = 100', 'step')}Divide by five and x is one hundred.`)));
    const beats = await collect(brain, 'solve 5x = 500');
    expect(say(beats)).toBe('First, simple. Five x is five hundred. Divide by five and x is one hundred.');
    expect(texOf(beats)).toEqual(['5x = 500', 'x = 100']);
    expect(lastNote(model.requests[1])).toContain('x = 200 does not follow');
  });

  it('says it is checking once, and only when the wait is long enough to need it, with no second filler after it', async () => {
    const { brain } = setup((_request, attempt) => (attempt === 1 ? reply(`Right, here. ${write('s', '2 + 2 = 5', 'new')}Two and two.`) : { pieces: ['So two plus two is four.'], firstTextMs: 90 }));
    const said = say(await collect(brain, 'add them'));
    expect(said.match(/Hold on, let me check that\./g)).toHaveLength(1);
    for (const filler of SPOKEN_LINES.stillWorking) expect(said).not.toContain(filler);
  });

  it('does not count the time before the false line against the wait', async () => {
    const { brain } = setup((_request, attempt) => (attempt === 1 ? { pieces: ['Right, here. ', write('s', '2 + 2 = 5', 'new'), 'Two and two.'], stall: { beforePiece: 1, ms: 70 } } : reply('So two plus two is four.')));
    expect(say(await collect(brain, 'add them'))).toBe('Right, here. So two plus two is four.');
  });

  it('never repeats what the student already heard when it asks again', async () => {
    const { brain } = setup((_request, attempt) => (attempt === 1 ? reply(`Sure, here's your working. You started with two x plus three. ${write('s', '2 + 2 = 5', 'new')}Next.`) : reply(`Sure, let's look. You started with two x plus three. ${write('t', '2 + 2 = 4', 'new')}And two and two is four.`)));
    const said = say(await collect(brain, 'show me'));
    expect(said.match(/You started with two x plus three/g)).toHaveLength(1);
    expect(said).toContain('And two and two is four.');
  });

  it('drops the math and keeps teaching when the second try is false too', async () => {
    const { brain, model } = setup(() => reply(`Okay, so. ${write('s', '2 + 2 = 5', 'new')}Two and two is five.`));
    const beats = await collect(brain, 'add them');
    const said = say(beats);
    expect(said).not.toContain('five');
    expect(said).not.toMatch(/back that step|won't guess|not sure of that step/);
    expect(beats.at(-1)?.expectsReply).toBe(true);
    expect(model.requests).toHaveLength(2);
    expect(SPOKEN_LINES).not.toHaveProperty('mathStillWrong');
  });
});

describe('what a refusal is about', () => {
  const refuses = (category: string | null, pieces: string[] = []): FakeReply => ({ pieces, stopReason: 'refused', refusalCategory: category });

  it.each(['cyber', 'frontier_llm'])('does not frighten a child over a %s refusal, or check on them later', async (category) => {
    const { brain, model } = setup((_request, attempt) => (attempt === 1 ? refuses(category) : reply('Okay, plants next.')));
    const said = say(await collect(brain, 'something it declines'));
    expect(said).not.toMatch(/emergency|adult|safe/i);
    await collect(brain, 'what do plants need');
    expect(lastNote(model.requests.at(-1))).not.toContain('declined');
  });

  it('asks again once when a tutor is asked how it worked something out, because that is core teaching', async () => {
    const { brain, model, summaries } = setup((request) => (JSON.stringify(request.turns).includes('your whole reasoning') ? refuses('reasoning_extraction') : reply('Sure, step one is the light hitting the leaf.')));
    const said = say(await collect(brain, 'can you show me how you worked that out, step by step, your whole reasoning'));
    expect(said).toBe('Sure, step one is the light hitting the leaf.');
    expect(model.requests).toHaveLength(2);
    expect(summaries[0]?.endedAs).toBe('ended');
    await collect(brain, 'ok thanks');
    expect(JSON.stringify(model.requests.at(-1))).not.toContain('your whole reasoning');
  });

  it('gives a plain line with no safety talk when the second try is refused too', async () => {
    const { brain, model } = setup(() => refuses('reasoning_extraction'));
    const beats = await collect(brain, 'show me your whole reasoning');
    expect(model.requests).toHaveLength(2);
    expect(say(beats)).not.toMatch(/emergency|adult|safe/i);
    expect(beats.at(-1)?.expectsReply).toBe(true);
  });

  it.each(['bio', 'general_harms', null, 'something_new'])('keeps the safety line and the later check for %s, which could be about the student', async (category) => {
    const { brain, model } = setup((_request, attempt) => (attempt === 1 ? refuses(category) : reply('Okay, are you safe?')));
    const said = say(await collect(brain, 'something serious'));
    expect(said).toMatch(/adult you trust/);
    expect(said).toMatch(/local emergency number/);
    expect(model.requests).toHaveLength(1);
    await collect(brain, 'can we do fractions');
    expect(lastNote(model.requests.at(-1))).toContain('declined');
  });

  it('never tells the tutor it cannot see the message it is answering', async () => {
    const { brain, model } = setup((_request, attempt) => (attempt === 1 ? refuses('bio') : reply('That sounds serious.')));
    await collect(brain, 'how do i make sarin');
    await collect(brain, 'my dad hits me and i wanted to scare him');
    const note = lastNote(model.requests.at(-1));
    expect(note).toContain('declined');
    expect(note).not.toMatch(/last message/);
    expect(note).toMatch(/earlier message/);
    expect(TUTOR_SYSTEM).not.toMatch(/declined: a safety check stopped their last message/);
  });
});

describe('a turn that talks like a person', () => {
  const sentence = (words: number, label: string) => `${Array.from({ length: words - 1 }, (_, index) => `${label}${index}`).join(' ')} end.`;

  it('breathes at a line break, so a long explanation is several short stretches', async () => {
    const { brain } = setup(() => reply('Okay, plants make food from light, water and air.\nThe leaf is where all of it happens every day.\nWhere does the water come from?'));
    const beats = await collect(brain, 'what is photosynthesis');
    expect(stretchesOf(beats)).toEqual(['Okay, plants make food from light, water and air.', 'The leaf is where all of it happens every day.', 'Where does the water come from?']);
    expect(beats[0]?.pauseBeforeMs).toBeUndefined();
  });

  it('breathes on its own at the next sentence end when a stretch runs long, and never mid sentence', async () => {
    const { brain } = setup(() => reply(`${sentence(20, 'a')} ${sentence(20, 'b')} ${sentence(10, 'c')}`));
    const stretches = stretchesOf(await collect(brain, 'tell me'));
    expect(stretches).toHaveLength(2);
    expect(stretches.every((stretch) => /\.$/.test(stretch))).toBe(true);
    expect(countWords(stretches[0] as string)).toBe(40);
  });

  it('does not breathe after a few words, because a pause after "Okay, look." sounds odd', async () => {
    const { brain } = setup(() => reply('Okay, look.\nThe leaf is where it happens.'));
    expect(stretchesOf(await collect(brain, 'tell me'))).toHaveLength(1);
  });

  it('caps a reply at its next sentence end, and throws away the rest', async () => {
    const { brain } = setup(() => reply(`${sentence(30, 'a')} ${sentence(30, 'b')} ${sentence(30, 'c')}`));
    const said = say(await collect(brain, 'tell me'));
    expect(countWords(said)).toBe(60);
    expect(said).toMatch(/end\.$/);
    expect(said).not.toContain('c0');
  });

  it('keeps a safety reply whole and in one breath, however long it runs', async () => {
    const safety = `That sounds serious. ${sentence(30, 'a')} ${sentence(30, 'b')} Please tell an adult you trust now, or call your local emergency number. Are you safe right now?`;
    const { brain } = setup(() => reply(safety));
    const beats = await collect(brain, 'someone is hurting me');
    expect(say(beats)).toContain('Are you safe right now?');
    expect(stretchesOf(beats)).toHaveLength(1);
  });

  it('does not wrap on an abbreviation or a trailing ellipsis, because neither ends a sentence', async () => {
    const lead = Array.from({ length: 62 }, (_, index) => `word${index}`).join(' ');
    const { brain: first } = setup(() => reply(`${lead} and it started in the U.S. and then spread.`));
    expect(say(await collect(first, 'tell me'))).toContain('and then spread.');
    const { brain: second } = setup(() => reply(`${lead} and then wait for it... it landed.`));
    expect(say(await collect(second, 'tell me'))).toContain('it landed.');
  });

  it('never speaks half a sentence when a stream drops', async () => {
    const { brain } = setup(() => ({ pieces: ['So the first thing '], failAfterPieces: 'connection lost' }));
    const said = say(await collect(brain, 'tell me'));
    expect(said).not.toContain('So the first thing');
    expect(SPOKEN_LINES.couldNotReply as readonly string[]).toContain(said);
  });

  it('teaches the short turn rule, and not to ask a question every time', () => {
    expect(TUTOR_SYSTEM).toMatch(/usually under 25 words, never more than 45/);
    expect(TUTOR_SYSTEM).toMatch(/line break/);
    expect(TUTOR_SYSTEM).not.toMatch(/End your turn by asking one real question whenever/);
  });
});

describe('lines that must stay true', () => {
  it('does not promise tomorrow, because the limit resets on a UTC day', () => {
    expect(SPOKEN_LINES.dailyLimit.join(' ')).not.toMatch(/tomorrow/i);
  });

  it('tells the tutor never to read a student profile back', () => {
    expect(TUTOR_SYSTEM).toMatch(/never mention notes/i);
  });
});
