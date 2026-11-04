import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type Beat, getBeatText } from '@astra/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeAnthropicSourceFinder, makeAnthropicTutorModel } from '../src/providers/anthropic.ts';
import { createTutorBrain, type TurnSummary, TUTOR_TIMEOUTS } from '../src/tutor/brain.ts';
import { SPOKEN_LINES } from '../src/tutor/spoken-lines.ts';
import { startFakeAnthropic, type WireReply, type WireRequest } from './fake-anthropic-wire.ts';

const QUICK = { ...TUTOR_TIMEOUTS, firstTextMs: 500, stillWorkingMs: 300, betweenTextMs: 500, reportWaitMs: 30 };
const TRIGGER = 'TRIGGER';
const FINE: WireReply = { text: ['Okay, sure thing. ', 'What next?'] };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const hasTrigger = ({ body }: WireRequest) => JSON.stringify(body.messages).includes(TRIGGER);

describe('the real SDK against a recorded stream', () => {
  const savedBaseUrl = process.env.ANTHROPIC_BASE_URL;
  let close = async () => {};

  async function setup(getReply: (request: WireRequest, index: number) => WireReply) {
    const server = await startFakeAnthropic(getReply);
    close = server.close as () => Promise<void>;
    process.env.ANTHROPIC_BASE_URL = server.url;
    const summaries: TurnSummary[] = [];
    const brain = createTutorBrain({ model: makeAnthropicTutorModel({ apiKey: 'test-key' }), timeouts: QUICK, onTurnEnd: (summary) => summaries.push(summary) });
    const ask = async (text: string, signal = new AbortController().signal) => {
      const beats: Beat[] = [];
      for await (const beat of brain.reply({ text }, signal)) beats.push(beat);
      return beats.map(getBeatText).join(' ');
    };
    return { server, brain, summaries, ask };
  }

  beforeEach(() => {
    close = async () => {};
  });

  afterEach(async () => {
    await close();
    if (savedBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = savedBaseUrl;
  });

  it('a refusal after words does not refuse every later turn', async () => {
    const { ask, server } = await setup((request) => (hasTrigger(request) ? { text: ['Well, the first thing '], stopReason: 'refusal', refusalCategory: 'general_harms' } : FINE));
    expect(SPOKEN_LINES.refused).toContain(await ask(TRIGGER));
    expect(await ask('what is two plus two')).toBe('Okay, sure thing. What next?');
    expect(await ask('hello?')).toBe('Okay, sure thing. What next?');
    expect(JSON.stringify(server.requests.at(-1)?.body.messages)).not.toContain('first thing');
  });

  it('words, a dropped stream, and a refusal on the retry do not refuse every later turn', async () => {
    const { ask, server } = await setup((request, index) => {
      if (index === 1) return { text: ['Well, the first thing, '], staysOpen: true };
      return hasTrigger(request) ? { stopReason: 'refusal', refusalCategory: 'general_harms' } : FINE;
    });
    await ask(TRIGGER);
    expect(await ask('what is two plus two')).toBe('Okay, sure thing. What next?');
    expect(JSON.stringify(server.requests.at(-1)?.body.messages)).not.toContain(TRIGGER);
  });

  it('an interrupted turn closes the stream on the server and charges by estimate', async () => {
    const { brain, server, summaries } = await setup(() => ({ text: ['Okay, one two three. '], staysOpen: true }));
    const controller = new AbortController();
    const reader = brain.reply({ text: 'FIRST' }, controller.signal)[Symbol.asyncIterator]();
    await reader.next();
    controller.abort();
    await reader.return?.(undefined);
    await delay(50);
    expect(server.requests[0]?.wasClosedEarly).toBe(true);
    expect(summaries[0]?.isUsageEstimated).toBe(true);
    expect(summaries[0]?.costUsd).toBeGreaterThan(0);
  });

  it('a 400 is not sent again, and the next turn starts clean', async () => {
    const { ask, server } = await setup((request) => (hasTrigger(request) ? { status: 400 } : FINE));
    expect(SPOKEN_LINES.couldNotReply).toContain(await ask(TRIGGER));
    expect(server.requests).toHaveLength(1);
    expect(await ask('hello')).toBe('Okay, sure thing. What next?');
    expect(JSON.stringify(server.requests.at(-1)?.body.messages)).not.toContain(TRIGGER);
  });

  it('a 500 is sent once more, because it may pass', async () => {
    const { ask, server } = await setup((_request, index) => (index === 1 ? { status: 500, errorType: 'api_error' } : FINE));
    expect(await ask('hello')).toBe('Okay, sure thing. What next?');
    expect(server.requests).toHaveLength(2);
  });

  it('half an emoji never reaches the wire as a broken escape', async () => {
    const { ask, server } = await setup(() => FINE);
    await ask(`${'a'.repeat(1999)}😀😀😀`);
    const sent = JSON.stringify(server.requests[0]?.body.messages);
    expect(sent).toContain('😀');
    expect(sent).not.toMatch(/\\ud83d(?!\\ud)/i);
  });
});

describe('a source found on the web', () => {
  const savedBaseUrl = process.env.ANTHROPIC_BASE_URL;

  afterEach(() => {
    process.env.ANTHROPIC_BASE_URL = savedBaseUrl;
  });

  it('keeps a page title from carrying markup, control characters, or a board command to the tutor', async () => {
    const title = `Why {"kind":"text"} <b>sky</b>\u0007\u200b is blue ${'x'.repeat(200)}`;
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'haiku', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'web_search_tool_result', tool_use_id: 't', content: [{ type: 'web_search_result', title, url: 'https://www.nasa.gov/sky', encrypted_content: '', page_age: null }] }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const answer = await makeAnthropicSourceFinder({ apiKey: 'test-key' })('the sky is blue', new AbortController().signal);
    server.close();
    expect(answer).toMatchObject({ found: true, site: 'nasa.gov', url: 'https://www.nasa.gov/sky' });
    const kept = answer.found ? answer.title : '';
    expect(kept.startsWith('Why "kind":"text" bsky/b is blue x')).toBe(true);
    expect(kept).toHaveLength(100);
    expect(kept).not.toMatch(/[<>{}\u200b]/u);
    expect(kept).not.toContain('\u0007');
  });
});
