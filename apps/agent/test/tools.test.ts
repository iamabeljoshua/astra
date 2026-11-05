import { type Beat, getBeatText } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { type FakeReply, makeFakeTutorModel } from '../src/providers/fake-model.ts';
import type { FindSource, TutorModelRequest } from '../src/providers/types.ts';
import { createTutorBrain, type TurnSummary } from '../src/tutor/brain.ts';
import { TUTOR_PROMPT } from '../src/tutor/prompt.ts';

const QUICK = { firstTextMs: 1200, betweenTextMs: 800, finishGraceMs: 20, reportWaitMs: 30 };
const COMPUTE_CALL = '{"tool":"compute","expression":"47 \\\\times 52"}';

function setup(getReply: (request: TutorModelRequest, attempt: number) => FakeReply, findSource?: FindSource) {
  const model = makeFakeTutorModel(getReply);
  const summaries: TurnSummary[] = [];
  const brain = createTutorBrain({ model, timeouts: QUICK, prompt: { ...TUTOR_PROMPT, turnNote: null }, onTurnEnd: (summary) => summaries.push(summary), ...(findSource ? { findSource } : {}) });
  return { model, brain, summaries };
}

async function collect(brain: ReturnType<typeof setup>['brain'], text: string): Promise<Beat[]> {
  const beats: Beat[] = [];
  for await (const beat of brain.reply({ text }, new AbortController().signal)) beats.push(beat);
  return beats;
}

const getNotes = (request: TutorModelRequest | undefined) => (request?.turns ?? []).flatMap((turn) => ('text' in turn && turn.role === 'system' ? [JSON.parse(turn.text) as Record<string, unknown>] : []));

describe('a tool the tutor calls when it needs one', () => {
  it('speaks what came first, stops at the call, and carries on with the answer from code', async () => {
    const { brain, model, summaries } = setup((_request, attempt) => (attempt === 1 ? { pieces: ['Let me work that out. ', COMPUTE_CALL, ' It comes to two thousand.'] } : { pieces: ['That comes to two thousand four hundred and forty four.'] }));
    const beats = await collect(brain, 'what is 47 times 52?');
    expect(beats.map(getBeatText).join(' ')).toBe('Let me work that out. That comes to two thousand four hundred and forty four.');
    expect(model.requests).toHaveLength(2);
    expect(getNotes(model.requests[1])).toContainEqual({ tool_result: { tool: 'compute', expression: '47 \\times 52', ok: true, value: '2444' }, already_said: 'Let me work that out.', next: 'You have the result now. Say it in plain words in this reply, and do not make this call again.' });
    expect(summaries[0]?.toolCalls).toEqual([{ tool: 'compute', expression: '47 \\times 52', values: {} }]);
    expect(summaries[0]?.endedAs).toBe('ended');
  });

  it('never puts the tool call on the board or in the voice', async () => {
    const { brain } = setup((_request, attempt) => (attempt === 1 ? { pieces: ['Okay, one moment. ', COMPUTE_CALL] } : { pieces: ['Done now.'] }));
    const beats = await collect(brain, 'what is 47 times 52?');
    expect(JSON.stringify(beats)).not.toContain('compute');
  });

  it('stops answering tools after three in a turn, so a reply cannot loop', async () => {
    const { brain, model } = setup((_request, attempt) => (attempt <= 4 ? { pieces: [`Step ${attempt} now. `, `{"tool":"compute","expression":"${attempt} + 1"}`] } : { pieces: ['So that is it.'] }));
    await collect(brain, 'keep computing');
    const lastNotes = getNotes(model.requests[4]);
    expect(JSON.stringify(lastNotes.at(-1))).toContain('No more tools');
    expect(model.requests).toHaveLength(5);
  });

  it('ends the turn when a model keeps calling after it was told to stop, so spending has a ceiling', async () => {
    const { brain, model, summaries } = setup((_request, attempt) => ({ pieces: ['One more now. ', `{"tool":"compute","expression":"${attempt} + 1"}`] }));
    const beats = await collect(brain, 'keep computing forever');
    expect(model.requests).toHaveLength(5);
    expect(beats.map(getBeatText).join(' ')).toContain('It comes to four.');
    expect(summaries[0]?.endedAs).toBe('ended');
  });

  it('does not count a tool call against the one retry a false line gets', async () => {
    const { brain, model } = setup((_request, attempt) => {
      if (attempt === 1) return { pieces: ['Let me see. ', COMPUTE_CALL] };
      if (attempt === 2) return { pieces: ['Now look. ', '{"kind":"writeMath","id":"a","tex":"2 + 2 = 5","claim":"new"}', 'Two and two.'] };
      return { pieces: ['Now look. ', '{"kind":"writeMath","id":"a","tex":"2 + 2 = 4","claim":"new"}', 'Two and two.'] };
    });
    const beats = await collect(brain, 'go');
    expect(beats.map(getBeatText).join(' ')).toContain('Two and two');
    expect(model.requests).toHaveLength(3);
  });

  it('tells the model about a bad call and keeps the words', async () => {
    const { brain, model } = setup(() => ({ pieces: ['Okay here it is. ', '{"tool":"laser"}', 'Same as before.'] }));
    const beats = await collect(brain, 'go');
    expect(beats.map(getBeatText).join(' ')).toBe('Okay here it is. Same as before.');
    await collect(brain, 'next');
    expect(JSON.stringify(model.requests.at(-1))).toContain('there is no tool named laser');
  });

  it('gives only a title and an address from a source, and charges for the search', async () => {
    const findSource: FindSource = async () => ({ found: true, title: 'Why is the sky blue?', site: 'spaceplace.nasa.gov', url: 'https://spaceplace.nasa.gov/blue-sky/', costUsd: 0.01 });
    const { brain, model, summaries } = setup((_request, attempt) => (attempt === 1 ? { pieces: ['Let me find one. ', '{"tool":"findSource","claim":"air scatters blue light most"}'] } : { pieces: ['NASA has a page on it.'] }), findSource);
    await collect(brain, 'where can i read that?');
    expect(JSON.stringify(getNotes(model.requests[1]))).toContain('spaceplace.nasa.gov');
    expect(summaries[0]?.costUsd).toBeGreaterThanOrEqual(0.01);
  });

  it('says it found nothing when no search is wired, and the model is told so', async () => {
    const { brain, model } = setup((_request, attempt) => (attempt === 1 ? { pieces: ['Let me look. ', '{"tool":"findSource","claim":"a claim"}'] } : { pieces: ['I could not find one.'] }));
    await collect(brain, 'source?');
    expect(JSON.stringify(getNotes(model.requests[1]))).toContain('"found":false');
  });
});
