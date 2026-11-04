import { type AgentMessage, type Beat, parseBeat } from '@astra/contracts';
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

function makeOutput(): VoiceOutput {
  let queuedUntilMs = 0;
  return {
    sampleRate: 24000,
    async captureFrame(frame: { samplesPerChannel: number; sampleRate: number }) {
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

function start() {
  const messages: AgentMessage[] = [];
  const onPause = vi.fn();
  const said: string[] = [];
  const tutor: TutorBrain = {
    async *reply({ text }) {
      said.push(text);
      yield makeBeat('reply-1', 'one two three four five');
    },
  };
  const send = (message: AgentMessage) => void messages.push(message);
  const voice: tts.TTS = makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts();
  const session = createLiveSession({ messenger: { send, sendOnBothChannels: send }, line: createVoiceLine(makeOutput()), voice, tutor, takes: createTakePicker(TAKES), allTakes: TAKES, setTurnCap: () => {}, onPause });
  sessions.push(session);
  const beatsSent = () => [...new Set(messages.flatMap((message) => (message.type === 'words' ? [message.beatId as string] : [])))];
  return { session, messages, onPause, said, beatsSent };
}

const untilSent = async (read: () => string[], id: string) => {
  for (let tries = 0; tries < 200 && !read().includes(id); tries += 1) await delay(10);
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

  it('refuses while the student is talking', () => {
    const { session } = start();
    session.onEars({ type: 'voiceStarted' } satisfies EarsEvent);
    expect(session.isAtPause()).toBe(false);
    expect(session.speakScene([makeBeat('scene-a', 'watch the line')])).toBe(false);
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
