import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAnthropicSceneModels } from '../src/providers/anthropic.scenes.ts';

interface FakeReply {
  text: string;
  stop?: string;
}

const sent = vi.hoisted(() => ({ params: [] as Record<string, unknown>[], replies: [] as { text: string; stop?: string }[] }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = {
      messages: {
        stream: (params: Record<string, unknown>) => {
          sent.params.push(params);
          const reply = sent.replies.shift() as FakeReply;
          return { on() {}, currentMessage: undefined, finalMessage: async () => ({ model: 'fake', stop_reason: reply.stop ?? 'end_turn', content: [{ type: 'text', text: reply.text }], usage: { input_tokens: 1, output_tokens: 1 } }) };
        },
      },
    };
  },
}));

const models = makeAnthropicSceneModels({ apiKey: 'test-key' });
const route = (request: string) => models.router.route(request, new AbortController().signal);
const readPrompt = (name: string) => readFileSync(resolve(import.meta.dirname, '../src/scenes/prompts', name), 'utf8');

beforeEach(() => {
  sent.params.length = 0;
  sent.replies.length = 0;
});

describe('a router that answers in prose', () => {
  it.each(['yes', 'that was confusing', 'can you say that again'])('is not read as danger when the words show none: %s', async (request) => {
    sent.replies.push({ text: 'Sure, what would you like to learn?' }, { text: 'Happy to help!' });
    expect(await route(request)).toMatchObject({ engine: 'none', kind: 'none', topic: '' });
  });

  it('is read as danger when the words show it, so a child does not fall to the no-lesson line', async () => {
    sent.replies.push({ text: 'I am worried about you.' }, { text: 'Please talk to someone.' });
    expect(await route('how much tylenol would wreck your liver')).toMatchObject({ kind: 'safety', topic: '' });
  });

  it('gives the help line when the API itself stops the reply', async () => {
    sent.replies.push({ text: '', stop: 'refusal' }, { text: '', stop: 'refusal' });
    expect(await route('what is the softest way to go')).toMatchObject({ kind: 'safety', topic: '' });
  });

  it('asks for JSON by its schema, so a plain yes has no prose to send', async () => {
    sent.replies.push({ text: '{"kind":"none","engine":"none","topic":""}' });
    await route('yes');
    expect(sent.params[0]?.output_config).toMatchObject({ format: { type: 'json_schema' } });
  });
});

describe('the name reader', () => {
  it('reads the flagged words and nothing else of the lesson', async () => {
    sent.replies.push({ text: JSON.stringify({ names: [{ name: 'Pacific Ocean', kind: 'place' }, { name: 'Sam Okoro', kind: 'person' }] }) });
    const cleared = await models.nameReader.clear(['Pacific Ocean', 'Sam Okoro'], new AbortController().signal);
    expect([...cleared]).toEqual(['Pacific Ocean']);
    expect((sent.params[0]?.messages as { content: string }[])[0]?.content).toBe('["Pacific Ocean","Sam Okoro"]');
  });
});

describe('what the prompts say a tutor must not do', () => {
  it.each(['planner.md', 'reviewer.md'])('%s refuses dose arithmetic for a person and anatomy framed around cutting, even as a word problem', (name) => {
    const prompt = readPrompt(name);
    expect(prompt).toMatch(/dose arithmetic for a person/i);
    expect(prompt).toMatch(/word problem/i);
    expect(prompt).toMatch(/anatomy framed around cutting/i);
  });

  it.each(['planner.md', 'reviewer.md'])('%s lets a lesson name a place, an event, or a historical figure', (name) => {
    expect(readPrompt(name)).toMatch(/historical figure/i);
  });

  it('the router separates a student being hurt from a dangerous question and from a fair one', () => {
    const prompt = readPrompt('router.md');
    expect(prompt).toMatch(/"safety"/);
    expect(prompt).toMatch(/"dangerous"/);
    expect(prompt).toMatch(/slang/i);
    expect(prompt).toMatch(/Fair questions/);
  });
});

describe('a kit route the router is in doubt about', () => {
  it.each([
    ['a kind that is not a solid thing', { kind: 'math', engine: 'kit', topic: 'what a derivative is' }],
    ['a kind nobody listed', { kind: 'feeling', engine: 'kit', topic: 'how a volcano erupts' }],
    ['a topic that names symbols', { kind: 'physics-object', engine: 'kit', topic: 'solve two x plus three equals eleven' }],
    ['a topic that names a plot', { kind: 'astronomy', engine: 'kit', topic: 'the graph of a falling ball' }],
  ])('gets no scene, with %s, and keeps the topic for the tutor', async (_name, reply) => {
    sent.replies.push({ text: JSON.stringify(reply) });
    expect(await route('anything')).toMatchObject({ engine: 'none', topic: reply.topic });
  });

  it.each([['physics-object', 'how gears work'], ['chemistry', 'how a candle burns'], ['biology', 'inside a cell'], ['astronomy', 'why the moon has phases'], ['earth-engineering', 'how a volcano erupts']])('stays on the kit for %s', async (kind, topic) => {
    sent.replies.push({ text: JSON.stringify({ kind, engine: 'kit', topic }) });
    expect(await route('anything')).toMatchObject({ engine: 'kit', topic });
  });

  it('holds ManimGX to nothing new', async () => {
    sent.replies.push({ text: JSON.stringify({ kind: 'math', engine: 'manimgx', topic: 'solve two x plus three equals eleven' }) });
    expect(await route('anything')).toMatchObject({ engine: 'manimgx' });
  });
});
