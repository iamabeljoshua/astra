import { type Beat, getBeatText } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { type FakeReply, makeFakeTutorModel } from '../src/providers/fake-model.ts';
import type { FindSource, TutorModelRequest } from '../src/providers/types.ts';
import { createTutorBrain, type TurnSummary } from '../src/tutor/brain.ts';
import { TUTOR_PROMPT } from '../src/tutor/prompt.ts';
import { SPOKEN_LINES } from '../src/tutor/spoken-lines.ts';

const QUICK = { stillWorkingMs: 400, firstTextMs: 300, betweenTextMs: 300, finishGraceMs: 20, reportWaitMs: 30 };
const CUBED = '{"tool":"compute","expression":"17^3"}';
const OPENER = 'Let me work that out. ';
const CUBED_SPOKEN = 'It comes to four thousand nine hundred thirteen.';

function setup(getReply: (request: TutorModelRequest, attempt: number) => FakeReply, findSource?: FindSource) {
  const model = makeFakeTutorModel(getReply);
  const summaries: TurnSummary[] = [];
  const brain = createTutorBrain({ model, timeouts: QUICK, prompt: { ...TUTOR_PROMPT, turnNote: null }, onTurnEnd: (summary) => summaries.push(summary), ...(findSource ? { findSource } : {}) });
  return { model, brain, summaries };
}

async function ask(brain: ReturnType<typeof setup>['brain'], text: string): Promise<string> {
  const beats: Beat[] = [];
  for await (const beat of brain.reply({ text }, new AbortController().signal)) beats.push(beat);
  return beats.map(getBeatText).join(' ');
}

const getCall = (expression: string) => JSON.stringify({ tool: 'compute', expression });

describe('a student who heard "let me work that out"', () => {
  it('hears the first result in words when the model repeats the same call, with no further wait on the model', async () => {
    const { brain, model, summaries } = setup(() => ({ pieces: [OPENER, CUBED] }));
    expect(await ask(brain, 'what is 17 cubed')).toBe(`Let me work that out. ${CUBED_SPOKEN}`);
    expect(model.requests).toHaveLength(2);
    expect(summaries[0]?.toolCalls).toHaveLength(1);
    expect(summaries[0]?.endedAs).toBe('ended');
  });

  it('never hears that the tutor said too much', async () => {
    const { brain } = setup(() => ({ pieces: [OPENER, CUBED] }));
    expect(await ask(brain, 'what is 17 cubed')).not.toContain(SPOKEN_LINES.cutShort[0]);
  });

  it('hears about how big a fraction is when it has no ending decimal', async () => {
    const { brain } = setup(() => ({ pieces: [OPENER, getCall('3/7')] }));
    expect(await ask(brain, 'whats 3/7 as a decimal')).toBe('Let me work that out. It comes to about zero point four two eight five seven one.');
  });

  it('hears the result when the model stops with only its opening again', async () => {
    const { brain } = setup((_request, attempt) => (attempt === 1 ? { pieces: [OPENER, CUBED] } : { pieces: [OPENER] }));
    expect(await ask(brain, 'what is 17 cubed')).toBe(`Let me work that out. ${CUBED_SPOKEN}`);
  });

  it('hears the result straight away when the model goes quiet after the tool', async () => {
    const { brain, model } = setup((_request, attempt) => (attempt === 1 ? { pieces: [OPENER, CUBED] } : { pieces: ['Late.'], firstTextMs: 5000 }));
    expect(await ask(brain, 'what is 17 cubed')).toContain(CUBED_SPOKEN);
    expect(model.requests).toHaveLength(2);
  });

  it('hears an honest line that names help when code has no words for the result', async () => {
    const { brain, model } = setup(() => ({ pieces: [OPENER, getCall('x + 1')] }));
    const said = await ask(brain, 'what is x plus 1');
    expect(said).toContain(SPOKEN_LINES.noToolAnswer[0]);
    expect(said).toContain('adult');
    expect(model.requests).toHaveLength(2);
  });

  it('hears the latest result when the model calls something new past the limit', async () => {
    const calls = ['1 + 1', '1 + 2', '1 + 3', '1 + 4', '1 + 5', '1 + 6'];
    const { brain } = setup((_request, attempt) => ({ pieces: [`Step ${attempt} now. `, getCall(calls[attempt - 1] as string)] }));
    const said = await ask(brain, 'keep computing');
    expect(said.endsWith('It comes to four.')).toBe(true);
    expect(said).not.toContain(SPOKEN_LINES.cutShort[0]);
  });

  it('keeps what code said in the history, and no tool call, so the next turn knows the answer was given', async () => {
    const { brain, model } = setup((request) => (JSON.stringify(request.turns).includes('thanks') ? { pieces: ['Any time now.'] } : { pieces: [OPENER, CUBED] }));
    await ask(brain, 'what is 17 cubed');
    await ask(brain, 'thanks');
    const assistant = model.requests.at(-1)?.turns.find((turn) => turn.role === 'assistant');
    expect(assistant).toMatchObject({ text: `Let me work that out. ${CUBED_SPOKEN}` });
  });

  it('tells the model to say the result now, in the same note as the result', async () => {
    const { brain, model } = setup((_request, attempt) => (attempt === 1 ? { pieces: [OPENER, CUBED] } : { pieces: ['That comes to plenty.'] }));
    await ask(brain, 'what is 17 cubed');
    expect(JSON.stringify(model.requests[1])).toContain('You have the result now. Say it in plain words in this reply, and do not make this call again.');
  });

  it('keeps going when a call is nested too deep for code to read', async () => {
    const depth = 3000;
    const deep = `${'('.repeat(depth)}1${')'.repeat(depth)}`;
    const { brain, model } = setup((_request, attempt) => (attempt === 1 ? { pieces: [OPENER, getCall(deep)] } : { pieces: ['That one is too tangled.'] }));
    expect(await ask(brain, 'what is this')).toContain('too tangled');
    expect(JSON.stringify(model.requests[1])).toContain('nested too deep');
  });

  it('hears that nothing was found when a repeated search found nothing, and hears the site when it found one', async () => {
    const claim = '{"tool":"findSource","claim":"a claim"}';
    const none = setup(() => ({ pieces: ['Let me look. ', claim] }));
    expect(await ask(none.brain, 'source?')).toBe("Let me look. I couldn't find a page for that, and I won't guess at one.");
    const found: FindSource = async () => ({ found: true, title: 'A page', site: 'britannica.com', url: 'https://britannica.com/a', costUsd: 0.01 });
    const some = setup(() => ({ pieces: ['Let me look. ', claim] }), found);
    expect(await ask(some.brain, 'source?')).toBe('Let me look. I found a page on britannica.com.');
  });

  it('hears the values when a table is repeated', async () => {
    const plot = '{"tool":"plotValues","expression":"x^2 - 2","letter":"x","from":-1,"to":1,"points":3}';
    const { brain } = setup(() => ({ pieces: ['Let me see. ', plot] }));
    expect(await ask(brain, 'give me the values')).toBe("Let me see. At minus one it's minus one, at zero it's minus two, at one it's minus one.");
  });
});
