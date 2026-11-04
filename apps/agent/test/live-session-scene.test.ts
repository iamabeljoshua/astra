import { type AgentMessage, type Beat, parseBeat, type SessionRecap } from '@astra/contracts';
import { initializeLogger, tts } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiveSession, type EarsEvent, type LiveSession } from '../src/live/live-session.ts';
import { createTakePicker, type StoredTake } from '../src/live/reactions.ts';
import { createVoiceLine, type VoiceOutput } from '../src/live/voice-line.ts';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';
import type { TutorBeat, TutorBrain } from '../src/tutor/brain.ts';

initializeLogger({ pretty: false, level: 'silent' });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeBeat(id: string, text: string, pauseBeforeMs?: number): TutorBeat {
  const parsed = parseBeat({ id, script: [text], expectsReply: false });
  if (!parsed.ok) throw new Error(parsed.problem);
  return pauseBeforeMs === undefined ? parsed.value : { ...parsed.value, pauseBeforeMs };
}

function makeTake(id: string, use: StoredTake['use'], phrase: string): StoredTake {
  const { pcm, words } = renderTone(phrase);
  return { id, use, phrase, sampleRate: 24000, words, base64: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64') };
}

const TAKES = [makeTake('hm', 'reaction', 'Hm.'), makeTake('okay', 'reaction', 'Okay.'), makeTake('greet', 'greeting', 'Hi there.')];

function makeOutput(failAfter = Infinity): VoiceOutput {
  let queuedUntilMs = 0;
  let framesTaken = 0;
  return {
    sampleRate: 24000,
    async captureFrame(frame: { samplesPerChannel: number; sampleRate: number }) {
      framesTaken += 1;
      if (framesTaken > failAfter) throw new Error('InvalidState - failed to capture frame');
      const nowMs = performance.now();
      queuedUntilMs = Math.max(queuedUntilMs, nowMs) + (frame.samplesPerChannel / frame.sampleRate) * 1000;
    },
    clearQueue() {
      queuedUntilMs = 0;
    },
    async waitForPlayout() {
      await delay(Math.max(0, queuedUntilMs - performance.now()));
    },
  } as unknown as VoiceOutput;
}

const sessions: LiveSession[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
});

function start({ failAfter = Infinity, reply = makeBeat('reply-1', 'one two three four five'), recap = null as SessionRecap | null } = {}) {
  const messages: AgentMessage[] = [];
  const onPause = vi.fn();
  const onEnding = vi.fn();
  const onEndingOver = vi.fn();
  const said: string[] = [];
  const tutor: TutorBrain = {
    async *reply({ text }) {
      said.push(text);
      yield reply;
    },
  };
  const send = (message: AgentMessage) => void messages.push(message);
  const voice: tts.TTS = makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts();
  const session = createLiveSession({ messenger: { send, sendOnBothChannels: send }, line: createVoiceLine(makeOutput(failAfter)), voice, tutor, takes: createTakePicker(TAKES), allTakes: TAKES, setTurnCap: () => {}, onPause, onEnding, onEndingOver, writeRecap: async () => recap });
  sessions.push(session);
  const beatsSent = () => [...new Set(messages.flatMap((message) => (message.type === 'words' ? [message.beatId as string] : [])))];
  return { session, messages, onPause, onEnding, onEndingOver, said, beatsSent };
}

const untilSent = async (read: () => string[], id: string) => {
  for (let tries = 0; tries < 200 && !read().includes(id); tries += 1) await delay(10);
  return read();
};

const untilMatching = async (read: () => string[], pattern: RegExp) => {
  for (let tries = 0; tries < 500 && !read().some((id) => pattern.test(id)); tries += 1) await delay(10);
  return read();
};

describe('a scene turn in a live session', () => {
  it('speaks its lines at a pause, with a breath between them', async () => {
    const { session, beatsSent } = start();
    expect(session.isAtPause()).toBe(true);
    expect(session.speakScene([makeBeat('scene-a', 'watch the line'), makeBeat('scene-b', 'it climbs and climbs', 50)])).toBe(true);
    expect(await untilSent(beatsSent, 'scene-b')).toEqual(['scene-a', 'scene-b']);
  });

  it('refuses while the tutor is already talking, and takes the next pause', async () => {
    const { session, onPause } = start();
    session.onBrowser({ type: 'typed', text: 'why does it fall' } as never);
    for (let tries = 0; tries < 50 && session.isAtPause(); tries += 1) await delay(10);
    expect(session.speakScene([makeBeat('scene-a', 'watch the line')])).toBe(false);
    for (let tries = 0; tries < 400 && onPause.mock.calls.length === 0; tries += 1) await delay(10);
    expect(onPause).toHaveBeenCalled();
    expect(session.isAtPause()).toBe(true);
  });

  it('leaves room to answer after a question, so a scene never talks straight over it', async () => {
    const question = parseBeat({ id: 'reply-1', script: ['what do you think it means?'], expectsReply: true });
    if (!question.ok) throw new Error(question.problem);
    const { session, onPause } = start({ reply: question.value });
    session.onBrowser({ type: 'typed', text: 'why does it fall' } as never);
    for (let tries = 0; tries < 400 && onPause.mock.calls.length === 0; tries += 1) await delay(10);
    expect(onPause).toHaveBeenCalled();
    expect(session.isAtPause()).toBe(false);
    expect(session.speakScene([makeBeat('scene-a', 'watch the line')])).toBe(false);
  });

  it('refuses while the student is talking', () => {
    const { session } = start();
    session.onEars({ type: 'voiceStarted' } satisfies EarsEvent);
    expect(session.isAtPause()).toBe(false);
    expect(session.speakScene([makeBeat('scene-a', 'watch the line')])).toBe(false);
  });

  it('carries on from the cut word after a cough, and fires nothing twice', async () => {
    const { session, messages, beatsSent } = start();
    const scene = parseBeat({ id: 'scene-a', script: [{ kind: 'text', id: 'a-note', text: 'n' }, 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen'], expectsReply: false });
    if (!scene.ok) throw new Error(scene.problem);
    session.speakScene([scene.value]);
    await untilSent(beatsSent, 'scene-a');
    const turn = messages.find((message) => message.type === 'turnStarted');
    if (turn?.type !== 'turnStarted') throw new Error('no turn');
    session.onEars({ type: 'voiceStarted' });
    for (let tries = 0; tries < 300 && !messages.some((message) => message.type === 'stop'); tries += 1) await delay(10);
    session.onBrowser({ type: 'played', turnId: turn.turnId, beatId: 'scene-a', playedWords: 3, firedCueMs: [0], frozen: [], ending: 'interrupted', clockId: 'page', browserMs: 1000, startedMsAgo: 0 } as never);
    session.onEars({ type: 'voiceEnded' });
    const resumed = (await untilMatching(beatsSent, /^scene-a-r\d+$/)).find((id) => /^scene-a-r\d+$/.test(id));
    expect(resumed).toBeDefined();
    const cues = messages.filter((message) => message.type === 'cue' && message.command.kind === 'text');
    expect(cues).toHaveLength(1);
    const words = messages.flatMap((message) => (message.type === 'words' && message.beatId === resumed ? message.words.map(({ text }) => text) : []));
    expect(words[0]).toBe('three');
  });

  it('survives a voice that fails, with a stored line, and the session goes on', async () => {
    const { session, beatsSent, onPause } = start({ failAfter: 3 });
    session.speakScene([makeBeat('scene-a', 'one two three four five six seven eight nine ten eleven twelve')]);
    await untilSent(beatsSent, 'scene-a');
    for (let tries = 0; tries < 400 && onPause.mock.calls.length === 0; tries += 1) await delay(10);
    expect(onPause).toHaveBeenCalled();
    expect(session.speakScene([makeBeat('scene-b', 'and back again')])).toBeTypeOf('boolean');
  });

  it('gives way to a typed question at once, and the brain answers it', async () => {
    const { session, said, messages, beatsSent } = start();
    const narration: Beat[] = [makeBeat('scene-a', 'one two three four five six seven eight nine ten eleven twelve')];
    session.speakScene(narration);
    await untilSent(beatsSent, 'scene-a');
    session.onBrowser({ type: 'typed', text: 'wait what is a slope' } as never);
    expect(await untilSent(beatsSent, 'reply-1')).toContain('reply-1');
    expect(said).toEqual(['wait what is a slope']);
    expect(messages.some((message) => message.type === 'stop')).toBe(true);
  });
});

describe('an End press with a scene on screen', () => {
  const SCENE_WORDS = Array.from({ length: 60 }, (_, index) => `word${index}`).join(' ');
  const RECAP: SessionRecap = { kind: 'lesson', covered: 'We watched a line climb.', gotRight: null, tryNext: 'Try a steeper one.' };
  const STAMP = { clockId: 'page', browserMs: 0, startedMsAgo: 0 };

  async function endDuringScene() {
    const started = start({ recap: RECAP });
    const { session, messages, beatsSent } = started;
    session.speakScene([makeBeat('scene-a', SCENE_WORDS), makeBeat('scene-b', 'the rest of the scene', 50)]);
    await untilSent(beatsSent, 'scene-a');
    const turn = messages.find((message) => message.type === 'turnStarted');
    if (turn?.type !== 'turnStarted') throw new Error('no turn');
    session.onBrowser({ type: 'played', turnId: turn.turnId, beatId: 'scene-a' as Beat['id'], ...STAMP, wordStartsMs: Array.from({ length: 60 }, (_, index) => index * 10), durationMs: 2000, playedWords: 60, firedCueMs: [], ending: 'finished', frozen: [] });
    session.onBrowser({ type: 'endingSession', ...STAMP });
    return { ...started, turn };
  }

  it('tells the scenes first, so nothing pending can land', async () => {
    const { onEnding } = await endDuringScene();
    expect(onEnding).toHaveBeenCalledTimes(1);
  });

  it('stops the scene\'s words, and the recap is what the student hears', async () => {
    const { messages, beatsSent } = await endDuringScene();
    await vi.waitFor(() => expect(messages.filter((message) => message.type === 'recap')).toEqual([{ type: 'recap', recap: RECAP }]));
    await vi.waitFor(() => expect(beatsSent().some((id) => id.startsWith('recap'))).toBe(true), { timeout: 3000 });
    expect(beatsSent()).not.toContain('scene-b');
  });

  it('takes no late scene, not while the recap plays and not after it', async () => {
    const { session, onEndingOver, beatsSent } = await endDuringScene();
    expect(session.isAtPause()).toBe(false);
    expect(session.speakScene([makeBeat('late-a', 'a scene too late')])).toBe(false);
    await vi.waitFor(() => expect(onEndingOver).toHaveBeenCalled(), { timeout: 8000 });
    expect(session.isAtPause()).toBe(false);
    expect(session.speakScene([makeBeat('late-b', 'a scene far too late')])).toBe(false);
    await delay(50);
    expect(beatsSent().filter((id) => id.startsWith('late'))).toEqual([]);
  }, 12_000);

  it('gives no held first line after a cut opening scene', async () => {
    const said: string[] = [];
    const messages: AgentMessage[] = [];
    const send = (message: AgentMessage) => void messages.push(message);
    const session = createLiveSession({
      messenger: { send, sendOnBothChannels: send },
      line: createVoiceLine(makeOutput()),
      voice: makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts(),
      tutor: {
        async *reply({ text }) {
          said.push(text);
          yield makeBeat('reply-1', 'the first line');
        },
      },
      takes: createTakePicker(TAKES),
      allTakes: TAKES,
      setTurnCap: () => {},
      getOpeningScene: async () => [makeBeat('scene-a', SCENE_WORDS)],
    });
    sessions.push(session);
    session.onBrowser({ type: 'typed', text: 'Let us talk about slopes.', isOpening: true, ...STAMP } as never);
    await vi.waitFor(() => expect(messages.some((message) => message.type === 'words')).toBe(true), { timeout: 3000 });
    session.onBrowser({ type: 'endingSession', ...STAMP });
    await delay(300);
    expect(said).toEqual([]);
    expect(messages.filter((message) => message.type === 'recap')).toEqual([{ type: 'recap', recap: null }]);
  });
});
