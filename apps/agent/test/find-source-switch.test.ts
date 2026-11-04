import { getBeatText } from '@astra/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeTutorModel } from '../src/providers/fake-model.ts';
import type { TutorModelRequest } from '../src/providers/types.ts';
import { makeTutorBrain, warmTutorModel } from '../src/tutor/make-brain.ts';
import { PROMPT_VERSIONS, TUTOR_SYSTEM } from '../src/tutor/prompt.ts';

const fakes = vi.hoisted(() => ({ finder: vi.fn(), makeModel: vi.fn() }));

vi.mock('../src/providers/anthropic.ts', async (original) => ({
  ...(await original<typeof import('../src/providers/anthropic.ts')>()),
  makeAnthropicSourceFinder: fakes.finder,
  makeAnthropicTutorModel: fakes.makeModel,
}));

const NO_DETAILS_SENTENCE = 'A claim is a general fact about the world. It never holds the name, age, school, town, health, or family of the student or anyone they know, and if the fact is about one of them, do not call findSource at all.';
const SAVED = { ...process.env };
const SEARCH = '{"tool":"findSource","claim":"Emma Clark, age 12, of Lincoln in Ohio, is the youngest student to skip a grade in Ohio"}';

async function askOnce(requests: TutorModelRequest[] = []) {
  const model = makeFakeTutorModel((request, attempt) => {
    requests.push(request);
    return attempt === 1 ? { pieces: ['Let me look. ', SEARCH] } : { pieces: ['I could not find one.'] };
  });
  fakes.makeModel.mockReturnValue(model);
  const { brain } = makeTutorBrain({ roomName: 'room', jobId: 'job', trace: () => {} });
  const said: string[] = [];
  for await (const beat of brain.reply({ text: 'is there a source?' }, new AbortController().signal)) said.push(getBeatText(beat));
  return said.join(' ');
}

describe('the switch on findSource', () => {
  const search = vi.fn(async () => ({ found: false as const, costUsd: 0 }));

  beforeEach(() => {
    process.env.ASTRA_TUTOR_MODEL = 'sonnet-5-5';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.ASTRA_FIND_SOURCE;
    delete process.env.ASTRA_API_URL;
    delete process.env.ASTRA_SPEND_FILE;
    fakes.finder.mockReset();
    fakes.finder.mockReturnValue(search);
    search.mockClear();
  });

  afterEach(() => {
    process.env = { ...SAVED };
  });

  it('is off by default, so the model is not told and no search can run', async () => {
    const requests: TutorModelRequest[] = [];
    await askOnce(requests);
    expect(fakes.finder).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    expect(requests[0]?.system).not.toContain('findSource');
  });

  it('runs a search only when switched on, and the model is then told a claim holds no details', async () => {
    process.env.ASTRA_FIND_SOURCE = 'on';
    const requests: TutorModelRequest[] = [];
    await askOnce(requests);
    expect(search).toHaveBeenCalledOnce();
    expect(requests[0]?.system).toContain(NO_DETAILS_SENTENCE);
  });

  it('warms the prompt it teaches from, on or off, so the cache is never cold', () => {
    const warm = vi.fn(async () => {});
    fakes.makeModel.mockReturnValue({ warm });
    warmTutorModel();
    expect(warm).toHaveBeenLastCalledWith(PROMPT_VERSIONS.v3.system);
    process.env.ASTRA_FIND_SOURCE = 'on';
    warmTutorModel();
    expect(warm).toHaveBeenLastCalledWith(PROMPT_VERSIONS.v3FindSource.system);
  });

  it('leaves the prompt the same but for the tool line, and the prompt in use by default is the one with no search', () => {
    expect(TUTOR_SYSTEM).toBe(PROMPT_VERSIONS.v3.system);
    expect(PROMPT_VERSIONS.v3.system).not.toContain('findSource');
    expect(PROMPT_VERSIONS.v3FindSource.system.replace(/\{"tool":"findSource".*\n/, '')).toBe(PROMPT_VERSIONS.v3.system);
  });

  it('keeps the crisis sentence in the old prompt, so v1 is the old prompt word for word', () => {
    expect(PROMPT_VERSIONS.v1.system).toContain('A question about how to die, how much of something would kill, how long bleeding out takes, or a painless way to go counts too');
  });
});
