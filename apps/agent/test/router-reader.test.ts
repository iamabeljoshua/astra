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

describe('the fit reader', () => {
  const TITLES = ['How DNA copies itself', 'Why Saturn has rings', 'What really causes the seasons', 'Why the Moon spins once per orbit', 'How the four strokes of an engine work'];
  const find = (topic: string) => models.fitReader.find(topic, TITLES, new AbortController().signal);

  it('names a listed title that holds most of the topic', async () => {
    sent.replies.push({ text: JSON.stringify({ title: 'How DNA copies itself' }) });
    expect(await find('how dna copies')).toBe('How DNA copies itself');
  });

  it.each([
    ['why the moon has phases', 'Why the Moon spins once per orbit'],
    ['how a jet engine works', 'How the four strokes of an engine work'],
  ])('holds a reader that talked itself into one shared word: %s', async (topic, title) => {
    sent.replies.push({ text: JSON.stringify({ title }) });
    expect(await find(topic)).toBeNull();
  });

  it.each([
    ['says none', ''],
    ['names a title not on the list', 'How DNA copies itself quickly'],
    ['names a title sharing no word with the topic', 'Why Saturn has rings'],
  ])('finds nothing when it %s', async (_name, title) => {
    sent.replies.push({ text: JSON.stringify({ title }) });
    expect(await find('how dna replicates')).toBeNull();
  });

  it('finds nothing when its reply cannot be read, because a wrong scene is the worst failure', async () => {
    sent.replies.push({ text: 'I think the first one.' });
    expect(await find('how dna replicates')).toBeNull();
  });
});

describe('a kit writer asked to fix what a review reported', () => {
  const BRIEF = { topic: 'gears', narration: '[[a]] One two.', plan: 'a: x', moments: { a: 0 }, durationSeconds: 2 };
  const REPAIR = { problems: ['the tutor says twenty teeth'], code: 'function scene(kit) {}', canChangeWords: true };
  const write = () => models.kitFallbackWriter.write(BRIEF, REPAIR, new AbortController().signal);
  const CODE = '```js\nfunction scene(kit) { return {}; }\n```';

  it('is told it may change the words, and hands back the words it changed', async () => {
    sent.replies.push({ text: `${CODE}\n\n\`\`\`json\n{"narration":"[[a]] Ten teeth.","close":"Why ten?"}\n\`\`\`` });
    expect(await write()).toMatchObject({ code: 'function scene(kit) { return {}; }', words: { narration: '[[a]] Ten teeth.', close: 'Why ten?' } });
    expect(JSON.stringify(sent.params[0]?.messages)).toMatch(/correct the words too/);
  });

  it('hands back the code alone when it changed no words', async () => {
    sent.replies.push({ text: CODE });
    const written = await write();
    expect(written.code).toBe('function scene(kit) { return {}; }');
    expect(written.words).toBeUndefined();
  });

  it.each(['{broken', '{"narration":7}', '["a"]'])('ignores words it cannot read: %s', async (block) => {
    sent.replies.push({ text: `${CODE}\n\`\`\`json\n${block}\n\`\`\`` });
    expect((await write()).words).toBeUndefined();
  });
});
