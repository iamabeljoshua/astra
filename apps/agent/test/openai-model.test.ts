import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getBeatText } from '@astra/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isOpenAiModelName, makeOpenAiTutorModel } from '../src/providers/openai.ts';
import { ModelRejectedError, type ModelEvent } from '../src/providers/types.ts';
import { createTutorBrain } from '../src/tutor/brain.ts';

const toSse = (chunk: unknown) => `data: ${JSON.stringify(chunk)}\n\n`;
const says = (content: string) => toSse({ choices: [{ delta: { content }, finish_reason: null }] });
const USAGE = { prompt_tokens: 1000, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 800 } };
const COMMAND = '{"kind":"writeMath","id":"w","tex":"x + 3 = 11","claim":"new"}';

let answer: { status: number; pieces: readonly string[] } = { status: 200, pieces: [] };
let sent: { model?: string; messages?: readonly { role: string; content: string }[] } = {};
let server: Server;

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = '';
    request.on('data', (piece) => (body += String(piece)));
    request.on('end', () => {
      sent = JSON.parse(body) as typeof sent;
      response.writeHead(answer.status, { 'content-type': 'text/event-stream' });
      for (const piece of answer.pieces) response.write(piece);
      response.end();
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(() => {
  delete process.env.OPENAI_BASE_URL;
  server.close();
});

const makeModel = () => makeOpenAiTutorModel({ name: 'openai:gpt-5.4-mini', apiKey: 'test-key' });

async function collect(events: AsyncIterable<ModelEvent>) {
  const seen: ModelEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

describe('the ChatGPT writer', () => {
  it('streams text in order and reports what it really cost, with cached tokens at their own price', async () => {
    const whole = `${says('Think of ')}${says('a fan.')}${toSse({ choices: [{ delta: {}, finish_reason: 'stop' }] })}${toSse({ choices: [], usage: USAGE })}data: [DONE]\n\n`;
    answer = { status: 200, pieces: [whole.slice(0, 25), whole.slice(25)] };
    const model = makeModel();
    const seen = await collect(model.stream({ system: 'Be kind.', turns: [{ role: 'user', text: 'hi' }, { role: 'system', text: '{"note":1}' }] }, new AbortController().signal));
    expect(seen.flatMap((event) => (event.type === 'text' ? [event.text] : []))).toEqual(['Think of ', 'a fan.']);
    expect(sent.model).toBe('gpt-5.4-mini');
    expect(sent.messages?.map(({ role }) => role)).toEqual(['system', 'user', 'system']);
    const finished = seen.at(-1);
    expect(finished).toMatchObject({ type: 'finished', stopReason: 'finished', usage: { inputTokens: 200, cacheReadTokens: 800, outputTokens: 20 } });
    if (finished?.type === 'finished') expect(model.getCostUsd(finished.usage)).toBeCloseTo((200 * 0.75 + 800 * 0.075 + 20 * 4.5) / 1_000_000, 10);
  });

  it('keeps a board command on the word it was written before, through the real brain', async () => {
    answer = { status: 200, pieces: [says('Say the bag is x. '), says(COMMAND.slice(0, 20)), says(`${COMMAND.slice(20)}Now it is on the board.`), toSse({ choices: [{ delta: {}, finish_reason: 'stop' }] }), toSse({ choices: [], usage: USAGE })] };
    const brain = createTutorBrain({ model: makeModel() });
    const beats = [];
    for await (const beat of brain.reply({ text: 'show me' }, new AbortController().signal)) beats.push(beat);
    expect(beats.map(getBeatText).join(' ')).toBe('Say the bag is x. Now it is on the board.');
    const parts = beats.flatMap((beat) => beat.script);
    const atCommand = parts.findIndex((part) => typeof part !== 'string' && part.kind === 'writeMath');
    expect(atCommand).toBeGreaterThan(0);
    expect(parts[atCommand + 1]).toMatch(/^Now/);
  });

  it('treats a refusal as a refusal, with no words of it said', async () => {
    answer = { status: 200, pieces: [toSse({ choices: [{ delta: { refusal: 'No.' }, finish_reason: null }] }), toSse({ choices: [{ delta: {}, finish_reason: 'stop' }] }), toSse({ choices: [], usage: USAGE })] };
    const seen = await collect(makeModel().stream({ system: '', turns: [] }, new AbortController().signal));
    expect(seen.filter(({ type }) => type === 'text')).toEqual([]);
    expect(seen.at(-1)).toMatchObject({ type: 'finished', stopReason: 'refused', refusalCategory: null });
  });

  it('says a request it can never send, and leaves a slow day to be tried again', async () => {
    answer = { status: 401, pieces: ['{"error":{"message":"bad key"}}'] };
    await expect(collect(makeModel().stream({ system: '', turns: [] }, new AbortController().signal))).rejects.toBeInstanceOf(ModelRejectedError);
    answer = { status: 503, pieces: ['busy'] };
    await expect(collect(makeModel().stream({ system: '', turns: [] }, new AbortController().signal))).rejects.not.toBeInstanceOf(ModelRejectedError);
  });

  it('counts a stream that ends with no usage as a failure, so no reply goes uncharged', async () => {
    answer = { status: 200, pieces: [says('Think of a fan.')] };
    await expect(collect(makeModel().stream({ system: '', turns: [] }, new AbortController().signal))).rejects.toThrow('no usage');
  });

  it('ends quietly when the student cuts in', async () => {
    const cut = new AbortController();
    cut.abort();
    await expect(collect(makeModel().stream({ system: '', turns: [] }, cut.signal))).resolves.toEqual([]);
  });

  it('knows only models it has a price for, so no cost goes unlogged', () => {
    expect(isOpenAiModelName('openai:gpt-5.4-mini')).toBe(true);
    expect(isOpenAiModelName('openai:gpt-5.4-pro')).toBe(false);
    expect(isOpenAiModelName('sonnet-5-5')).toBe(false);
  });
});
