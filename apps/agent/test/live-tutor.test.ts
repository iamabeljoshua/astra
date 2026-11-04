import { initializeLogger } from '@livekit/agents';
import type { AgentMessage, BrowserMessage, TurnId } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { createLiveSession, VOICE_STALL_MS } from '../src/live/live-session.ts';
import { createTakePicker, loadTakes } from '../src/live/reactions.ts';
import { createVoiceLine } from '../src/live/voice-line.ts';
import { type FakeReply, makeFakeTutorModel } from '../src/providers/fake-model.ts';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';
import { createTutorBrain, TUTOR_TIMEOUTS } from '../src/tutor/brain.ts';

initializeLogger({ pretty: false, level: 'silent' });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const STAMP = { clockId: 'test', browserMs: 0, startedMsAgo: 0 };
const typed = (text: string): BrowserMessage => ({ type: 'typed', text, ...STAMP });
const QUICK = { ...TUTOR_TIMEOUTS, stillWorkingMs: 60, firstTextMs: 200, betweenTextMs: 200 };

function setup(getReply: () => FakeReply, timeouts = QUICK) {
  const notes: { name: string; fields: Record<string, unknown>; atMs: number }[] = [];
  const messages: AgentMessage[] = [];
  const model = makeFakeTutorModel(getReply);
  const allTakes = loadTakes();
  const trace = (name: string, fields: Record<string, unknown> = {}) => notes.push({ name, fields, atMs: performance.now() });
  const session = createLiveSession({
    messenger: { send: (message) => messages.push(message), sendOnBothChannels: (message) => messages.push(message) },
    line: createVoiceLine({ sampleRate: 24000, captureFrame: async () => {}, clearQueue: () => {}, waitForPlayout: async () => {} }),
    voice: makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts(),
    tutor: createTutorBrain({ model, trace, timeouts }),
    takes: createTakePicker(allTakes),
    allTakes,
    setTurnCap: () => {},
    trace,
  });
  const find = (name: string, kind?: string) => notes.find((note) => note.name === name && (kind === undefined || note.fields.kind === kind));
  return { session, notes, messages, model, find };
}

describe('the brain in a live session', () => {
  it('reacts from code first, with no model in the path, and the model speaks after', async () => {
    const { session, find, messages } = setup(() => ({ pieces: ['Okay, here we go.'], firstTextMs: 300 }));
    const sentAtMs = performance.now();
    session.onBrowser(typed('Why does it fall?'));
    await delay(1000);
    expect(messages).toContainEqual({ type: 'heard' });
    expect((find('firstFrameCaptured', 'greeting')?.atMs as number) - sentAtMs).toBeLessThan(200);
    expect(find('firstFrameCaptured', 'reply')?.atMs as number).toBeGreaterThan(find('firstFrameCaptured', 'greeting')?.atMs as number);
    await session.close();
  });

  it('says it is thinking until the first beat, so the dot explains the quiet', async () => {
    const { session, messages } = setup(() => ({ pieces: ['Okay, here we go.'], firstTextMs: 50 }));
    session.onBrowser(typed('Why does it fall?'));
    await delay(300);
    const thinking = messages.filter((message) => message.type === 'thinking');
    expect(thinking.map((message) => message.isThinking)).toEqual([true, false]);
    await session.close();
  });

  it('never reads a slow model as a failed voice', async () => {
    const { session, notes, model } = setup(() => ({ pieces: ['Okay, here we go.'], firstTextMs: 10_000 }));
    session.onBrowser(typed('Why does it fall?'));
    await delay(600);
    expect(notes.map((note) => note.name)).not.toContain('voiceFailed');
    expect(model.requests.length).toBeGreaterThan(1);
    await session.close();
  });

  it('never reads a model that stalls between beats as a failed voice', async () => {
    const { session, notes } = setup(() => ({ pieces: ['Okay, one two. ', 'And then more.'], stall: { beforePiece: 1, ms: 10_000 } }), { ...QUICK, betweenTextMs: 10_000 });
    session.onBrowser(typed('Why does it fall?'));
    await delay(VOICE_STALL_MS + 400);
    expect(notes.map((note) => note.name)).not.toContain('voiceFailed');
    await session.close();
  });

  it('stops the model when a new message arrives, spends nothing more on it, and answers that instead', async () => {
    const { session, model, messages } = setup(() => ({ pieces: Array.from({ length: 40 }, (_, index) => `word${index} `), msPerPiece: 15 }));
    session.onBrowser(typed('First question'));
    await delay(200);
    session.onBrowser(typed('Actually, a second one'));
    await delay(150);
    expect(model.aborted.streams).toBe(1);
    expect(model.aborted.piecesNotSent).toBeGreaterThan(20);
    expect(model.requests).toHaveLength(2);
    expect(messages.filter((message) => message.type === 'heard')).toHaveLength(2);
    await session.close();
  });

  it('passes what played to the brain, so the next turn knows what was heard', async () => {
    const { session, model, messages } = setup(() => ({ pieces: ['Okay, one two three four.'] }));
    session.onBrowser(typed('count'));
    await delay(250);
    const turnId = (messages.find((message) => message.type === 'turnStarted' && message.turnId !== 'turn-1') as { turnId: TurnId }).turnId;
    session.onBrowser({ type: 'played', turnId, beatId: 't1-b0' as never, wordStartsMs: [0, 280], durationMs: 560, playedWords: 2, firedCueMs: [], ending: 'interrupted', frozen: [], ...STAMP });
    session.onBrowser(typed('wait'));
    await delay(300);
    const last = model.requests.at(-1)?.turns.at(-1);
    expect(last && 'text' in last ? (JSON.parse(last.text) as { cut: { heard: string } }).cut.heard : null).toBe('Okay, one');
    await session.close();
  });
});
