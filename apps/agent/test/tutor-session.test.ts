import { initializeLogger } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import type { AgentMessage, BeatId, BrowserMessage } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { makeFakeTutorModel, type FakeReply } from '../src/providers/fake-model.ts';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';
import { createTakePicker, loadTakes } from '../src/live/reactions.ts';
import { createVoiceLine } from '../src/live/voice-line.ts';
import { createTutorBrain } from '../src/tutor/brain.ts';
import { createTutorSession } from '../src/tutor/tutor-session.ts';

initializeLogger({ pretty: false, level: 'error' });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const STAMP = { clockId: 'test', browserMs: 0, startedMsAgo: 0 };
const typed = (text: string): BrowserMessage => ({ type: 'typed', text, ...STAMP });

function setup(getReply: () => FakeReply) {
  const notes: { name: string; fields: Record<string, unknown>; atMs: number }[] = [];
  const messages: AgentMessage[] = [];
  const frames: number[] = [];
  const model = makeFakeTutorModel(getReply);
  const allTakes = loadTakes();
  const trace = (name: string, fields: Record<string, unknown> = {}) => notes.push({ name, fields, atMs: performance.now() });
  const session = createTutorSession({
    messenger: { send: (message) => messages.push(message), sendOnBothChannels: (message) => messages.push(message) },
    line: createVoiceLine({ sampleRate: 24000, captureFrame: async (_frame: AudioFrame) => void frames.push(performance.now()), clearQueue: () => {}, waitForPlayout: async () => {} }),
    voice: makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts(),
    brain: createTutorBrain({ model, trace }),
    takes: createTakePicker(allTakes),
    allTakes,
    trace,
  });
  const find = (name: string, kind?: string) => notes.find((note) => note.name === name && (kind === undefined || note.fields.kind === kind));
  return { session, notes, messages, frames, model, find };
}

describe('a typed lesson', () => {
  it('reacts from code first, with no model in the path, then the model speaks on the same line', async () => {
    const { session, find, messages, model } = setup(() => ({ pieces: ['Okay, here we go.'], firstTextMs: 400 }));
    session.onBrowser(typed('Why does it fall?'));
    await delay(1200);
    const received = find('typedReceived')?.atMs as number;
    const reaction = find('firstFrameCaptured', 'reaction')?.atMs as number;
    const reply = find('firstFrameCaptured', 'reply')?.atMs as number;
    expect(reaction - received).toBeLessThan(200);
    expect(reply).toBeGreaterThan(reaction);
    expect(messages[0]).toEqual({ type: 'heard' });
    expect(model.requests).toHaveLength(1);
    await session.close();
  });

  it('stops the voice and the model when a new message arrives, and answers that instead', async () => {
    const { session, messages, model, find } = setup(() => ({ pieces: Array.from({ length: 40 }, (_, index) => `word${index} `), msPerPiece: 10 }));
    session.onBrowser(typed('First question'));
    await delay(150);
    session.onBrowser(typed('Actually, a second one'));
    await delay(200);
    expect(model.aborted.streams).toBe(1);
    expect(model.requests).toHaveLength(2);
    expect(messages.filter((message) => message.type === 'heard')).toHaveLength(2);
    expect(find('thoughtFailed')).toBeUndefined();
    await session.close();
  });

  it('lets a question sent as the page opens wait behind the greeting', async () => {
    const { session, messages, find } = setup(() => ({ pieces: ['Okay, here we go.'] }));
    session.greet();
    session.onBrowser(typed('My first question'));
    await delay(800);
    expect(find('turnStarted', 'greeting')).toBeDefined();
    expect(find('turnStarted', 'reaction')).toBeUndefined();
    expect(messages.filter((message) => message.type === 'stop')).toHaveLength(0);
    await session.close();
  });

  it('ignores an empty message', async () => {
    const { session, model, find } = setup(() => ({ pieces: ['Okay.'] }));
    session.onBrowser(typed('  ​ '));
    await delay(30);
    expect(model.requests).toHaveLength(0);
    expect(find('typedReceived')).toBeUndefined();
    await session.close();
  });

  it('passes what played to the brain, so the next turn knows what was heard', async () => {
    const { session, model } = setup(() => ({ pieces: ['Okay, one two three.'] }));
    session.onBrowser(typed('count'));
    await delay(100);
    const beatId = 't1-b0' as BeatId;
    session.onBrowser({ type: 'played', turnId: 'turn-2' as never, beatId, wordStartsMs: [0, 280], durationMs: 560, playedWords: 2, firedCueMs: [], ending: 'interrupted', frozen: [], ...STAMP });
    session.onBrowser(typed('wait'));
    await delay(250);
    const last = model.requests.at(-1)?.turns.at(-1);
    expect(last && 'text' in last ? JSON.parse(last.text).cut.heard : null).toBe('Okay, one');
    await session.close();
  });
});
