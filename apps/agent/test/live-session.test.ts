import { type AgentMessage, type Beat, type BrowserMessage, parseBeat, type TurnId, type TutorClosedReason } from '@astra/contracts';
import { initializeLogger, tts } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';
import { type EarsEvent, createLiveSession, type LiveSession, QUIET_ROOM_LIMIT_MS, VOICE_STALL_MS } from '../src/live/live-session.ts';
import { createTakePicker, type StoredTake } from '../src/live/reactions.ts';
import type { TutorBrain } from '../src/live/stand-in-tutor.ts';
import type { TutorBeat } from '../src/tutor/brain.ts';
import { TURN_TIMINGS } from '../src/live/turn-rule.ts';
import { createVoiceLine, type VoiceOutput } from '../src/live/voice-line.ts';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';

initializeLogger({ pretty: false, level: 'silent' });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeBeat(id: string, text: string, expectsReply = false): Beat {
  const parsed = parseBeat({ id, script: [{ kind: 'text', id: `${id}-note`, text: 'n' }, text], expectsReply });
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
}

function makeTake(id: string, use: StoredTake['use'], phrase: string): StoredTake {
  const { pcm, words } = renderTone(phrase);
  return { id, use, phrase, sampleRate: 24000, words, base64: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64') };
}

const TAKES = [makeTake('talk', 'talkInvitation', 'You can talk to me any time, just press Talk.'), makeTake('good', 'goodQuestion', 'Good question.'), makeTake('hm', 'reaction', 'Hm.'), makeTake('okay', 'reaction', 'Okay.'), makeTake('right', 'reaction', 'Right.'), makeTake('hello', 'greeting', 'Hello there.'), makeTake('prompt', 'prompt', 'Take your time.'), makeTake('lost', 'voiceLost', 'Sorry about that.')];

const LONG_LINE = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen';

interface Harness {
  session: LiveSession;
  messages: AgentMessage[];
  traces: { name: string; fields: Record<string, unknown> }[];
  frames: { atMs: number }[];
  ears(event: EarsEvent): void;
  browser(message: BrowserMessage): void;
  getTurnsStarted(): TurnId[];
  say(text: string): Promise<void>;
  didStop(turnId: TurnId): boolean;
  brainRequests: string[];
  aborted: number;
}

function makeOutput(frames: { atMs: number }[], failAfter = Infinity): VoiceOutput {
  let queuedUntilMs = 0;
  let endPlayoutWait = () => {};
  return {
    sampleRate: 24000,
    async captureFrame(frame) {
      if (frames.length >= failAfter) throw new Error('InvalidState - failed to capture frame');
      frames.push({ atMs: performance.now() });
      queuedUntilMs = Math.max(queuedUntilMs, performance.now()) + (frame.samplesPerChannel / frame.sampleRate) * 1000;
    },
    clearQueue() {
      queuedUntilMs = 0;
      endPlayoutWait();
    },
    async waitForPlayout() {
      await new Promise<void>((resolve) => {
        endPlayoutWait = resolve;
        setTimeout(resolve, Math.max(0, queuedUntilMs - performance.now()));
      });
    },
  };
}

function start({ voice = makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts(), failAfter, quietLimitMs, onQuietLimit, tutorBeats, endLine, replyLine = LONG_LINE, closedReason = null }: { endLine?: () => void; replyLine?: string; closedReason?: TutorClosedReason | null;  voice?: tts.TTS; failAfter?: number; quietLimitMs?: number; onQuietLimit?(): void; tutorBeats?: readonly TutorBeat[] } = {}): Harness {
  const messages: AgentMessage[] = [];
  const traces: Harness['traces'] = [];
  const frames: { atMs: number }[] = [];
  const brainRequests: string[] = [];
  let replies = 0;
  const harness = { aborted: 0 } as Harness;
  const tutor: TutorBrain = {
    async *reply({ text }, signal) {
      brainRequests.push(text);
      replies += 1;
      signal.addEventListener('abort', () => {
        harness.aborted += 1;
      });
      if (tutorBeats) yield* tutorBeats;
      else yield makeBeat(`reply-${replies}`, replyLine);
    },
    getClosedReason: () => closedReason,
  };
  const send = (message: AgentMessage) => void messages.push(message);
  const session = createLiveSession({
    messenger: { send, sendOnBothChannels: send },
    line: createVoiceLine(makeOutput(frames, failAfter)),
    voice,
    tutor,
    takes: createTakePicker(TAKES),
    allTakes: TAKES,
    setTurnCap: () => {},
    endLine,
    onQuietLimit,
    ...(quietLimitMs === undefined ? {} : { quietLimitMs }),
    trace: (name, fields = {}) => void traces.push({ name, fields }),
  });
  sessions.push(session);
  return Object.assign(harness, {
    session,
    messages,
    traces,
    frames,
    brainRequests,
    ears: session.onEars,
    browser: session.onBrowser,
    getTurnsStarted: () => messages.flatMap((message) => (message.type === 'turnStarted' ? [message.turnId] : [])),
    didStop: (turnId: TurnId) => messages.some((message) => message.type === 'stop' && message.turnId === turnId),
    async say(text: string) {
      session.onEars({ type: 'voiceStarted' });
      session.onEars({ type: 'words', text, isFinal: false });
      session.onEars({ type: 'voiceEnded' });
      session.onEars({ type: 'words', text, isFinal: true });
      session.onEars({ type: 'turnDecided', text });
      await delay(20);
    },
  });
}

const sessions: LiveSession[] = [];

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
});

const STAMP = { clockId: 'page', browserMs: 1000, startedMsAgo: 0 };

describe('a hold from before the room was ready', () => {
  const kinds = (harness: Harness) => harness.traces.filter((trace) => trace.name === 'turnStarted').map((trace) => trace.fields.kind);

  it('still says the greeting when the hold had no words in it', async () => {
    const harness = start({ replyLine: 'one two' });
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: false, invitesTalk: false });
    harness.browser({ type: 'holdStarted', ...STAMP });
    harness.browser({ type: 'typed', ...STAMP, text: 'Tell me about gravity' });
    harness.browser({ type: 'lineEnded', ...STAMP });
    harness.ears({ type: 'lineFlushed' });
    await delay(600);
    expect(kinds(harness)).toContain('greeting');
    expect(kinds(harness).filter((kind) => kind === 'greeting')).toHaveLength(1);
  }, 10_000);

  it('plays no greeting under the hold, and the greeting it owes comes with the answer', async () => {
    const harness = start({ replyLine: 'one two' });
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: false, invitesTalk: false });
    harness.browser({ type: 'holdStarted', ...STAMP });
    harness.browser({ type: 'typed', ...STAMP, text: 'Tell me about gravity' });
    await delay(300);
    expect(kinds(harness)).not.toContain('greeting');
    harness.ears({ type: 'words', text: 'why does it fall', isFinal: true });
    harness.browser({ type: 'lineEnded', ...STAMP });
    harness.ears({ type: 'lineFlushed' });
    await delay(900);
    expect(kinds(harness).slice(-2)).toEqual(['greeting', 'reply']);
    expect(harness.brainRequests.at(-1)).toContain('why does it fall');
    expect(harness.brainRequests.at(-1)).toContain('Tell me about gravity');
  }, 10_000);
});

describe('a student turn', () => {
  it('reacts in a stored voice first, with no brain in its path, then speaks the reply on its own turn', async () => {
    const { say, getTurnsStarted, traces, messages, brainRequests } = start();
    await say('Why does it fall');
    await delay(TURN_TIMINGS.reactionFloorMs + 700);
    const kinds = traces.filter((trace) => trace.name === 'turnStarted').map((trace) => trace.fields.kind);
    expect(kinds).toEqual(['greeting', 'reply']);
    expect(messages.some((message) => message.type === 'heard')).toBe(true);
    expect(getTurnsStarted()).toHaveLength(2);
    expect(brainRequests).toEqual(['Why does it fall']);
  });

  it('keeps the reply silent until the reaction has played and the silence has passed', async () => {
    const { say, messages, getTurnsStarted } = start();
    await say('Why');
    expect(messages.filter((message) => message.type === 'turnStarted')).toHaveLength(1);
    await delay(900);
    expect(getTurnsStarted()).toHaveLength(2);
  });

  it('shows the student their own words', () => {
    const { ears, messages } = start();
    ears({ type: 'voiceStarted' });
    ears({ type: 'words', text: 'Why does', isFinal: false });
    expect(messages).toContainEqual({ type: 'studentWords', text: 'Why does', isFinal: false });
  });
});

describe('barge-in', () => {
  it('stops every live turn, not only the newest, and drops the brain', async () => {
    const harness = start();
    await harness.say('Why');
    await delay(80);
    const reactionTurn = harness.getTurnsStarted()[0] as TurnId;
    harness.ears({ type: 'voiceStarted' });
    harness.ears({ type: 'words', text: 'Wait no', isFinal: false });
    await delay(30);
    expect(harness.didStop(reactionTurn)).toBe(true);
    expect(harness.aborted).toBe(1);
    const framesAtStop = harness.frames.length;
    await delay(400);
    expect(harness.frames.length).toBe(framesAtStop);
  });

  it('gives no turn the line while an earlier one still holds it', async () => {
    const harness = start();
    await harness.say('Why');
    await delay(30);
    harness.ears({ type: 'voiceStarted' });
    harness.ears({ type: 'words', text: 'Wait', isFinal: false });
    harness.ears({ type: 'voiceEnded' });
    harness.ears({ type: 'words', text: 'Wait.', isFinal: true });
    harness.ears({ type: 'turnDecided', text: 'Wait.' });
    await delay(1000);
    expect(harness.brainRequests.at(-1)).toContain('Wait.');
    expect(harness.traces.filter((trace) => trace.name === 'voiceFailed')).toEqual([]);
  });

  it('answers what was never answered, after a stop during thinking with interim words only', async () => {
    const harness = start();
    await harness.say('Gravity.');
    harness.ears({ type: 'voiceStarted' });
    harness.ears({ type: 'words', text: 'It lands', isFinal: false });
    harness.ears({ type: 'voiceEnded' });
    await delay(TURN_TIMINGS.heldFinalMs + 100);
    expect(harness.brainRequests.at(-1)).toBe('Gravity. It lands');
  });
});

describe('a student the tutor jumped in on', () => {
  it('gets one reply to everything they said, not to the last half', { timeout: 6000 }, async () => {
    const { say, brainRequests } = start();
    await say('I think it lands.');
    await delay(TURN_TIMINGS.reactionFloorMs + 900);
    await say('twice as far because the speed doubled.');
    expect(brainRequests).toEqual(['I think it lands.', 'I think it lands. twice as far because the speed doubled.']);
  });
});

describe('words a cut reply still owes, through the whole session', () => {
  const COUNT_WORDS = LONG_LINE.split(' ').length;

  it('does not repeat old words when a link cut left nothing to resume', { timeout: 8000 }, async () => {
    const harness = start();
    const pulse = (hearsAgent: boolean) => harness.browser({ type: 'pulse', ...STAMP, hearsAgent });
    pulse(true);
    await harness.say('Show me the ball.');
    await delay(TURN_TIMINGS.reactionFloorMs + 700);
    const turn = harness.getTurnsStarted().at(-1) as TurnId;
    const words = harness.messages.findLast((message) => message.type === 'words');
    expect(words?.type === 'words' && words.turnId).toBe(turn);
    pulse(false);
    await delay(50);
    harness.browser({ type: 'played', turnId: turn, beatId: (words as { beatId: Beat['id'] }).beatId, ...STAMP, wordStartsMs: Array.from({ length: COUNT_WORDS }, (_, word) => word * 100), durationMs: COUNT_WORDS * 100, playedWords: COUNT_WORDS, firedCueMs: [0], ending: 'finished', frozen: [] });
    pulse(true);
    await delay(400);
    expect(harness.traces.find((trace) => trace.name === 'resumeStarted')?.fields.beats).toBe(0);
    await harness.say('And the moon?');
    expect(harness.brainRequests.at(-1)).toBe('And the moon?');
  });

  it('keeps them through a filler and the prompt that follows it, because a stored line answers nothing', { timeout: TURN_TIMINGS.patienceMs + 5000 }, async () => {
    const harness = start();
    await harness.say('Why does it fall?');
    await delay(30);
    harness.ears({ type: 'voiceStarted' });
    harness.ears({ type: 'words', text: 'Hmm, let me think', isFinal: true });
    harness.ears({ type: 'voiceEnded' });
    harness.ears({ type: 'turnDecided', text: 'Hmm, let me think' });
    await delay(TURN_TIMINGS.patienceMs + 1500);
    expect(harness.traces.filter((trace) => trace.name === 'turnStarted').map((trace) => trace.fields.kind)).toContain('prompt');
    await harness.say('And the moon?');
    expect(harness.brainRequests.at(-1)).toBe('Why does it fall? And the moon?');
  });

  it('clears them once a reply has played to its end', { timeout: 8000 }, async () => {
    const harness = start();
    await harness.say('Why does it fall?');
    await delay(TURN_TIMINGS.reactionFloorMs + 300);
    await delay(COUNT_WORDS * 300 + 1200);
    await harness.say('And the moon?');
    expect(harness.brainRequests.at(-1)).toBe('And the moon?');
  });
});

describe('a failing voice', () => {
  class SilentVoice extends tts.TTS {
    label = 'silent';
    constructor() {
      super(24000, 1, { streaming: true, alignedTranscript: true });
    }
    synthesize(): tts.ChunkedStream {
      throw new Error('only streams');
    }
    stream(): tts.SynthesizeStream {
      return new SilentStream(this);
    }
  }
  class SilentStream extends tts.SynthesizeStream {
    label = 'silent';
    protected async run(): Promise<void> {
      for await (const _item of this.input) void _item;
      await new Promise(() => {});
    }
  }

  it('says so in a stored line within the bound, rather than leaving the student in silence for 11 s', { timeout: VOICE_STALL_MS + 3000 }, async () => {
    const harness = start({ voice: new SilentVoice() });
    await harness.say('Why');
    await delay(VOICE_STALL_MS + 800);
    const started = harness.traces.filter((trace) => trace.name === 'turnStarted').map((trace) => trace.fields.kind);
    expect(harness.traces.some((trace) => trace.name === 'voiceFailed')).toBe(true);
    expect(started).toContain('voiceLost');
  });

  it('survives a capture failure, and reports the turn cut', async () => {
    const harness = start({ failAfter: 1 });
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: true, invitesTalk: false });
    await delay(600);
    expect(harness.traces.some((trace) => trace.name === 'voiceFailed')).toBe(true);
    const turn = harness.getTurnsStarted()[0] as TurnId;
    expect(harness.didStop(turn)).toBe(true);
    await harness.say('Still there?');
    expect(harness.brainRequests).toEqual(['Still there?']);
  });
});

describe('a dropped link', () => {
  it('stops talking when the pulse stops, and resumes from the report when it returns', { timeout: 8000 }, async () => {
    const harness = start();
    const pulse = (hearsAgent: boolean) => harness.browser({ type: 'pulse', ...STAMP, hearsAgent });
    pulse(true);
    await harness.say('Show me');
    await delay(1100);
    const turn = harness.getTurnsStarted().at(-1) as TurnId;
    pulse(false);
    await delay(50);
    expect(harness.didStop(turn)).toBe(true);
    harness.browser({ type: 'played', turnId: turn, beatId: 'reply-1' as Beat['id'], ...STAMP, wordStartsMs: [0, 280, 560, 840], durationMs: 900, playedWords: 4, firedCueMs: [0], ending: 'interrupted', frozen: [] });
    pulse(true);
    await delay(600);
    const resumed = harness.traces.find((trace) => trace.name === 'resumeStarted');
    expect(resumed?.fields.reported).toBe(true);
    const lastWords = harness.messages.filter((message) => message.type === 'words').at(-1);
    expect(lastWords && lastWords.type === 'words' && lastWords.words[0]?.text).toBe('four');
  });
});

describe('a report that reaches the agent twice', () => {
  const LESSON_BEAT = makeBeat('flight', LONG_LINE);
  const report = (playedWords: number, firedCues: number): BrowserMessage => ({ type: 'played', ...STAMP, turnId: 'unset' as never, beatId: LESSON_BEAT.id, wordStartsMs: Array.from({ length: playedWords }, (_, word) => word * 100), durationMs: playedWords * 100, playedWords, firedCueMs: Array.from({ length: firedCues }, () => 0), ending: 'interrupted', frozen: [] });

  it('resumes from the true report when a replayed zero report follows it, and fires no cue again', { timeout: 8000 }, async () => {
    const harness = start();
    await harness.say('Show me the ball');
    await delay(TURN_TIMINGS.reactionFloorMs + 900);
    const replyTurn = harness.getTurnsStarted().at(-1) as TurnId;
    const beatId = harness.messages.findLast((message) => message.type === 'words')?.beatId as Beat['id'];
    const onTurn = (message: BrowserMessage) => ({ ...message, turnId: replyTurn, beatId }) as BrowserMessage;
    harness.browser({ type: 'audioState', ...STAMP, isRunning: true });
    harness.browser({ type: 'audioState', ...STAMP, isRunning: false });
    await delay(30);
    harness.browser(onTurn(report(5, 1)));
    harness.browser(onTurn(report(0, 0)));
    harness.browser({ type: 'audioState', ...STAMP, isRunning: true });
    await delay(600);
    const resumedBeat = harness.messages.findLast((message) => message.type === 'words');
    expect(resumedBeat?.type === 'words' && resumedBeat.words[0]?.text).toBe('five');
    const resumedCues = harness.messages.filter((message) => message.type === 'cue' && message.beatId !== beatId && message.turnId !== replyTurn);
    expect(resumedCues).toHaveLength(0);
    expect(harness.session.getLog().filter((event) => event.kind === 'beatPlayed' && event.beat.id === beatId).map((event) => event.kind === 'beatPlayed' && event.playedWords)).toEqual([5]);
  });

  it('names each turn for this job, so a new job in the same room never reuses a turn a page has seen', async () => {
    const [first, second] = [start(), start()];
    await first.say('Why');
    await second.say('Why');
    expect(first.getTurnsStarted()[0]).not.toBe(second.getTurnsStarted()[0]);
  });
});

describe('a quiet room', () => {
  const warnings = (messages: AgentMessage[]) => messages.flatMap((message) => (message.type === 'quietWarning' ? [message.isOn] : []));

  it('sets the limit in one number, at ten minutes', () => {
    expect(QUIET_ROOM_LIMIT_MS).toBe(600_000);
  });

  it('warns first, and only then closes', async () => {
    let closed = 0;
    const { messages } = start({ quietLimitMs: 120, onQuietLimit: () => (closed += 1) });
    await delay(80);
    expect(warnings(messages)).toEqual([true]);
    expect(closed).toBe(0);
    await delay(80);
    expect(closed).toBe(1);
    expect(messages.some((message) => message.type === 'closingForQuiet')).toBe(true);
  });

  it('takes the warning down and starts again when the student answers it, types, speaks, or moves the board', async () => {
    let closed = 0;
    const { browser, ears, messages } = start({ quietLimitMs: 150, onQuietLimit: () => (closed += 1) });
    const answers: (() => void)[] = [
      () => browser({ type: 'stillHere', ...STAMP }),
      () => ears({ type: 'words', text: 'Hello', isFinal: false }),
      () => browser({ type: 'acted', ...STAMP, action: { kind: 'sliderSet', element: 'slider' as never, parameter: 'angle', value: 1 } as never }),
    ];
    for (const answer of answers) {
      await delay(100);
      answer();
    }
    await delay(60);
    expect(closed).toBe(0);
    expect(warnings(messages).filter((isOn) => !isOn).length).toBeGreaterThanOrEqual(1);
  });

  it('counts the tutor speaking as something happening', async () => {
    let closed = 0;
    const { say } = start({ quietLimitMs: 400, onQuietLimit: () => (closed += 1) });
    await delay(200);
    await say('Show me a long answer');
    await delay(300);
    expect(closed).toBe(0);
  });

  const until = async (isDone: () => boolean, limitMs = 8000) => {
    for (let waited = 0; waited < limitMs && !isDone(); waited += 10) await delay(10);
  };

  it('does not warn or close while the tutor speaks for longer than the limit, and does once it has stopped', async () => {
    let closed = 0;
    const { say, messages, traces } = start({ quietLimitMs: 300, onQuietLimit: () => (closed += 1), tutorBeats: [makeBeat('short', 'one two three four five six')] });
    await say('Show me a long answer');
    await until(() => traces.some(({ name, fields }) => name === 'turnFinished' && fields.kind === 'reply'));
    expect(traces.some(({ name, fields }) => name === 'turnFinished' && fields.kind === 'reply')).toBe(true);
    expect(warnings(messages)).toEqual([]);
    expect(closed).toBe(0);
    await until(() => closed === 1);
    expect(warnings(messages)).toEqual([true]);
    expect(closed).toBe(1);
  }, 20_000);

  it('does not count a breath between stretches as quiet, however long the student holds it', async () => {
    let closed = 0;
    const secondStretch = { ...makeBeat('second', 'And the next idea.'), pauseBeforeMs: 300 };
    const { say, ears, messages, traces } = start({ quietLimitMs: 300, onQuietLimit: () => (closed += 1), tutorBeats: [makeBeat('first', 'one two three'), secondStretch] });
    const replyTurns = () => traces.filter(({ name, fields }) => name === 'turnStarted' && fields.kind === 'reply');
    await say('Show me a long answer');
    await until(() => traces.some(({ name, fields }) => name === 'turnFinished' && fields.kind === 'reply'));
    ears({ type: 'voiceStarted' });
    await delay(700);
    expect(replyTurns()).toHaveLength(1);
    expect(warnings(messages)).toEqual([]);
    expect(closed).toBe(0);
    ears({ type: 'voiceEnded' });
    await until(() => replyTurns().length === 2);
    expect(replyTurns()).toHaveLength(2);
    await until(() => closed === 1);
    expect(closed).toBe(1);
  }, 20_000);

  it('leaves no quiet count running once the session has closed, even with a turn ending as it closes', async () => {
    let closed = 0;
    const { session, say, traces } = start({ quietLimitMs: 100, onQuietLimit: () => (closed += 1), tutorBeats: [makeBeat('short', 'one two three four five six')] });
    await say('Show me a long answer');
    await until(() => traces.some(({ name, fields }) => name === 'firstFrameCaptured' && fields.kind === 'reply'));
    await session.close();
    await delay(200);
    expect(closed).toBe(0);
  });

  it('hears a student keeping the room open even past the limit on other messages', async () => {
    let closed = 0;
    const { browser, messages } = start({ quietLimitMs: 200, onQuietLimit: () => (closed += 1) });
    await until(() => warnings(messages).length === 1);
    for (let index = 0; index < 300; index += 1) browser({ type: 'markNotDrawn', markId: 'forged', ...STAMP } as BrowserMessage);
    browser({ type: 'stillHere', ...STAMP });
    expect(warnings(messages)).toEqual([true, false]);
    expect(closed).toBe(0);
  });

  it('does not count a transcript with no words, or the page\'s own pulses and reports', async () => {
    let closed = 0;
    const { browser, ears } = start({ quietLimitMs: 100, onQuietLimit: () => (closed += 1) });
    await delay(50);
    ears({ type: 'words', text: ' ', isFinal: false });
    browser({ type: 'pulse', ...STAMP, hearsAgent: true });
    browser({ type: 'audioState', ...STAMP, isRunning: true });
    await delay(80);
    expect(closed).toBe(1);
  });
});

describe('a drop just after the agent finished a stretch, while the page still plays it', () => {
  const until = async (isDone: () => boolean) => {
    for (let waited = 0; waited < 15_000 && !isDone(); waited += 10) await delay(10);
  };
  const FIRST = makeBeat('first', 'one two three four');
  const SECOND = { ...makeBeat('second', 'five six seven eight'), pauseBeforeMs: 300 };
  const spokenIn = (messages: AgentMessage[], beatId: string) => messages.flatMap((message) => (message.type === 'words' && String(message.beatId).startsWith(beatId) ? message.words.map((word) => word.text) : []));
  const setUpStretches = async () => {
    const harness = start({ tutorBeats: [FIRST, SECOND] });
    harness.browser({ type: 'audioState', isRunning: true, ...STAMP });
    harness.browser({ type: 'hello', wantsGreeting: false, ...STAMP } as BrowserMessage);
    await harness.say('Show me a long answer');
    await until(() => harness.traces.some(({ name, fields }) => name === 'turnFinished' && fields.kind === 'reply'));
    const replyTurn = harness.traces.find(({ name, fields }) => name === 'turnFinished' && fields.kind === 'reply')?.fields.turnId as TurnId;
    const cutAtPage = () => harness.browser({ type: 'played', turnId: replyTurn, beatId: FIRST.id, wordStartsMs: [0, 280], durationMs: 560, playedWords: 2, firedCueMs: [], ending: 'interrupted', frozen: [], ...STAMP });
    return { ...harness, cutAtPage };
  };

  it('in the breath, replays the words the page did not play, then carries on', async () => {
    const { browser, messages, traces, cutAtPage } = await setUpStretches();
    browser({ type: 'audioState', isRunning: false, ...STAMP });
    cutAtPage();
    browser({ type: 'audioState', isRunning: true, ...STAMP });
    await until(() => traces.some(({ name, fields }) => name === 'turnFinished' && fields.kind === 'reply' && spokenIn(messages, 'second').length > 0));
    expect(spokenIn(messages, 'first-r')[0]).toBe('two');
    expect(spokenIn(messages, 'first-r')).toEqual(['two', 'three', 'four']);
    expect(spokenIn(messages, 'second')).toEqual(['five', 'six', 'seven', 'eight']);
  }, 30_000);

  it('during the next stretch, replays the end of the last one before it', async () => {
    const { browser, messages, traces, cutAtPage } = await setUpStretches();
    await until(() => spokenIn(messages, 'second').length > 0);
    cutAtPage();
    browser({ type: 'audioState', isRunning: false, ...STAMP });
    browser({ type: 'audioState', isRunning: true, ...STAMP });
    await until(() => traces.some(({ name }) => name === 'resumeStarted') && spokenIn(messages, 'first-r').length > 0);
    expect(spokenIn(messages, 'first-r')).toEqual(['two', 'three', 'four']);
  }, 30_000);

  it('replays a whole stretch whose turn never reached the page, because the voice having left the agent does not mean it was heard', async () => {
    const { browser, messages, traces } = await setUpStretches();
    await until(() => spokenIn(messages, 'second').length === 4);
    const before = spokenIn(messages, 'second').length;
    browser({ type: 'audioState', isRunning: false, ...STAMP });
    browser({ type: 'audioState', isRunning: true, ...STAMP });
    await until(() => traces.some(({ name }) => name === 'resumeStarted') && spokenIn(messages, 'second').length >= before + 4);
    expect(spokenIn(messages, 'second').slice(before)).toEqual(['five', 'six', 'seven', 'eight']);
  }, 30_000);

  it('replays a later beat of a cut stretch whole when the page has not reported it', async () => {
    const harness = start({ tutorBeats: [FIRST, makeBeat('middle', 'nine ten eleven twelve'), SECOND] });
    harness.browser({ type: 'audioState', isRunning: true, ...STAMP });
    await harness.say('Show me a long answer');
    await until(() => harness.traces.some(({ name, fields }) => name === 'turnFinished' && fields.kind === 'reply'));
    const replyTurn = harness.traces.find(({ name, fields }) => name === 'turnFinished' && fields.kind === 'reply')?.fields.turnId as TurnId;
    harness.browser({ type: 'played', turnId: replyTurn, beatId: FIRST.id, wordStartsMs: [0, 280], durationMs: 560, playedWords: 2, firedCueMs: [], ending: 'interrupted', frozen: [], ...STAMP });
    harness.browser({ type: 'audioState', isRunning: false, ...STAMP });
    harness.browser({ type: 'audioState', isRunning: true, ...STAMP });
    await until(() => spokenIn(harness.messages, 'second').length > 0);
    expect(spokenIn(harness.messages, 'first-r')).toEqual(['two', 'three', 'four']);
    expect(spokenIn(harness.messages, 'middle').slice(4)).toEqual(['nine', 'ten', 'eleven', 'twelve']);
  }, 30_000);

  it('replays nothing when the page played it all', async () => {
    const { browser, traces } = await setUpStretches();
    const replyTurn = traces.find(({ name, fields }) => name === 'turnFinished' && fields.kind === 'reply')?.fields.turnId as TurnId;
    browser({ type: 'played', turnId: replyTurn, beatId: FIRST.id, wordStartsMs: [0, 280, 560, 840], durationMs: 1100, playedWords: 4, firedCueMs: [], ending: 'finished', frozen: [], ...STAMP });
    browser({ type: 'audioState', isRunning: false, ...STAMP });
    browser({ type: 'audioState', isRunning: true, ...STAMP });
    await delay(300);
    expect(traces.some(({ name }) => name === 'resumeStarted')).toBe(false);
  }, 30_000);
});

describe('"Good question."', () => {
  const STAMP_TYPED = (text: string): BrowserMessage => ({ type: 'typed', text, ...STAMP });
  const until = async (isDone: () => boolean) => {
    for (let waited = 0; waited < 15_000 && !isDone(); waited += 10) await delay(10);
  };
  const kinds = (traces: Harness['traces']) => traces.filter(({ name }) => name === 'turnStarted').map(({ fields }) => fields.kind);

  it('plays on a typed line that asks, and never on the same words spoken', async () => {
    const { browser, say, traces } = start();
    browser(STAMP_TYPED('hello there'));
    await until(() => kinds(traces).includes('reply'));
    browser(STAMP_TYPED('Why does a ball slow down?'));
    await until(() => kinds(traces).filter((kind) => kind === 'reply').length === 2);
    expect(kinds(traces)).toContain('goodQuestion');
    traces.length = 0;
    await say('Why does a ball slow down?');
    await until(() => kinds(traces).includes('reply'));
    expect(kinds(traces)).not.toContain('goodQuestion');
  }, 30_000);

  it('does not play on an answer to a question the tutor just asked', async () => {
    const { browser, traces } = start();
    browser(STAMP_TYPED('hello there'));
    await until(() => kinds(traces).includes('reply'));
    browser({ type: 'questionHeard', turnId: 'turn-a' as TurnId, beatId: 'beat-a' as never, ...STAMP });
    traces.length = 0;
    browser(STAMP_TYPED('Is it five because of the slope?'));
    await until(() => kinds(traces).includes('reply'));
    expect(kinds(traces)).not.toContain('goodQuestion');
  }, 30_000);
});

describe('a student who cannot hear', () => {
  it('is on record, so the next turn is not told they heard it', () => {
    const harness = start();
    harness.browser({ type: 'audioState', ...STAMP, isRunning: false });
    expect(harness.session.doesStudentHearAudio()).toBe(false);
    harness.browser({ type: 'audioState', ...STAMP, isRunning: true });
    expect(harness.session.doesStudentHearAudio()).toBe(true);
  });

  it('pauses the tutor when audio stops mid-lesson, and carries on when it runs again', async () => {
    const harness = start();
    harness.browser({ type: 'audioState', ...STAMP, isRunning: true });
    await harness.say('Why');
    await delay(1000);
    harness.browser({ type: 'audioState', ...STAMP, isRunning: false });
    await delay(30);
    expect(harness.traces.some((trace) => trace.name === 'stopDecided' && trace.fields.reason === 'link lost')).toBe(true);
    harness.browser({ type: 'audioState', ...STAMP, isRunning: true });
    await delay(1200);
    expect(harness.traces.some((trace) => trace.name === 'resumeStarted')).toBe(true);
  });
});

describe('what the agent never does', () => {
  it('refuses a broken report and carries on', async () => {
    const harness = start();
    await harness.say('Why');
    await delay(100);
    const closed = harness.messages.find((message) => message.type === 'beatClosed');
    if (closed?.type !== 'beatClosed') throw new Error('no beat closed');
    harness.browser({ type: 'played', turnId: closed.turnId, beatId: closed.beatId, ...STAMP, wordStartsMs: [], durationMs: 0, playedWords: 99, firedCueMs: [], ending: 'finished', frozen: [] });
    await delay(50);
    expect(harness.traces.some((trace) => trace.name === 'reportRefused')).toBe(true);
  });

  it('never stops a turn twice for a report of its own stop', async () => {
    const harness = start();
    await harness.say('Why');
    await delay(30);
    const turn = harness.getTurnsStarted()[0] as TurnId;
    harness.ears({ type: 'voiceStarted' });
    harness.ears({ type: 'words', text: 'Wait', isFinal: false });
    harness.browser({ type: 'played', turnId: turn, beatId: 'reaction-1' as Beat['id'], ...STAMP, wordStartsMs: [0], durationMs: 10, playedWords: 1, firedCueMs: [], ending: 'interrupted', frozen: [] });
    await delay(30);
    expect(harness.traces.filter((trace) => trace.name === 'browserFroze')).toEqual([]);
  });
});

describe('the greeting', () => {
  it('plays once, when the page says it wants one', async () => {
    const harness = start();
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: true, invitesTalk: false });
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: true, invitesTalk: false });
    await delay(50);
    expect(harness.traces.filter((trace) => trace.name === 'turnStarted').map((trace) => trace.fields.kind)).toEqual(['greeting']);
  });

  it('stays quiet for a student who opened the room by typing', async () => {
    const harness = start();
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: false, invitesTalk: false });
    await delay(50);
    expect(harness.traces.filter((trace) => trace.name === 'turnStarted')).toEqual([]);
  });
});

describe('holding to talk', () => {
  const press = (harness: Harness) => harness.browser({ type: 'holdStarted', ...STAMP });
  const letGo = (harness: Harness) => harness.browser({ type: 'lineEnded', ...STAMP });

  async function startTutorSpeaking() {
    const harness = start();
    await harness.say('Why does it fall');
    await delay(TURN_TIMINGS.reactionFloorMs + 500);
    const replyTurn = harness.getTurnsStarted().at(-1) as TurnId;
    return { harness, replyTurn };
  }

  it('cuts the tutor on the press, with no sound and no words yet', async () => {
    const { harness, replyTurn } = await startTutorSpeaking();
    press(harness);
    expect(harness.didStop(replyTurn)).toBe(true);
  });

  it('answers when the final lands after letting go, with no wait on the voice detector and no turn cap', async () => {
    const ends: string[] = [];
    const harness = start({ endLine: () => ends.push('ended') });
    press(harness);
    harness.ears({ type: 'voiceStarted' });
    harness.ears({ type: 'words', text: 'It lands', isFinal: false });
    letGo(harness);
    expect(ends).toEqual(['ended']);
    expect(harness.brainRequests).toEqual([]);
    harness.ears({ type: 'words', text: 'It lands twice as far.', isFinal: true });
    harness.ears({ type: 'lineFlushed' });
    expect(harness.brainRequests).toEqual(['It lands twice as far.']);
  });

  it('answers soon after the final if Muse is slow to say it is done', async () => {
    const harness = start();
    press(harness);
    letGo(harness);
    harness.ears({ type: 'words', text: 'It lands twice as far.', isFinal: true });
    expect(harness.brainRequests).toEqual([]);
    await delay(260);
    expect(harness.brainRequests).toEqual(['It lands twice as far.']);
  });

  it('sends the dot and a reaction at once on letting go when words are in, without the 300 ms floor', async () => {
    const harness = start();
    press(harness);
    harness.ears({ type: 'words', text: 'It lands', isFinal: false });
    letGo(harness);
    expect(harness.messages.some((message) => message.type === 'heard')).toBe(true);
  });

  it('gives one answer, and drops the SDK turn that follows for the same words', async () => {
    const harness = start();
    press(harness);
    letGo(harness);
    harness.ears({ type: 'words', text: 'It lands twice as far.', isFinal: true });
    harness.ears({ type: 'lineFlushed' });
    harness.ears({ type: 'turnDecided', text: 'It lands twice as far.' });
    await delay(50);
    expect(harness.brainRequests).toEqual(['It lands twice as far.']);
  });

  it('never ends the line on a pause while held, however long', async () => {
    const harness = start();
    press(harness);
    harness.ears({ type: 'voiceStarted' });
    harness.ears({ type: 'words', text: 'Part one.', isFinal: true });
    harness.ears({ type: 'voiceEnded' });
    harness.ears({ type: 'turnDecided', text: 'Part one.' });
    await delay(TURN_TIMINGS.heldFinalMs + 200);
    expect(harness.brainRequests).toEqual([]);
    letGo(harness);
    harness.ears({ type: 'words', text: 'Part two.', isFinal: true });
    harness.ears({ type: 'lineFlushed' });
    expect(harness.brainRequests).toEqual(['Part one. Part two.']);
  });

  it('carries the tutor on from the cut word when a hold had no words', async () => {
    const { harness, replyTurn } = await startTutorSpeaking();
    press(harness);
    expect(harness.didStop(replyTurn)).toBe(true);
    letGo(harness);
    harness.session.onEars({ type: 'lineFlushed' });
    await delay(TURN_TIMINGS.transcriptGraceMs + 1100);
    const kinds = harness.traces.filter((trace) => trace.name === 'turnStarted').map((trace) => trace.fields.kind);
    expect(kinds.at(-1)).toBe('resume');
  });

  it('cuts a reply that was thinking when the key went down, as soon as its sound starts', async () => {
    const harness = start();
    harness.browser({ type: 'typed', ...STAMP, text: 'Why' });
    press(harness);
    await delay(800);
    expect(harness.traces.some((trace) => trace.name === 'stopDecided')).toBe(true);
    const replyTurn = harness.traces.find((trace) => trace.name === 'turnStarted' && trace.fields.kind === 'reply')?.fields.turnId;
    expect(harness.messages.some((message) => message.type === 'words' && message.turnId === replyTurn)).toBe(false);
  });

  it('answers from the partial if a final never comes, on the rule that holds for any held final', async () => {
    const harness = start();
    press(harness);
    harness.ears({ type: 'words', text: 'It lands', isFinal: false });
    letGo(harness);
    await delay(TURN_TIMINGS.heldFinalMs + 100);
    expect(harness.brainRequests).toEqual(['It lands']);
  });

  it('takes a new page as the line having ended, because a reload has no key down', async () => {
    const ends: string[] = [];
    const harness = start({ endLine: () => ends.push('ended') });
    press(harness);
    harness.browser({ type: 'hello', ...STAMP, clockId: 'a-new-page', wantsGreeting: false, invitesTalk: false });
    expect(ends).toEqual(['ended']);
  });

  it('keeps the hold through a hello from the same page, as on a rejoin or when the press opened the room', async () => {
    const ends: string[] = [];
    const harness = start({ endLine: () => ends.push('ended') });
    press(harness);
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: false, invitesTalk: false });
    expect(ends).toEqual([]);
  });

  it('gives no greeting to a student who opened the room by holding, because they have the floor', async () => {
    const harness = start();
    press(harness);
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: true, invitesTalk: false });
    await delay(50);
    expect(harness.traces.some((trace) => trace.name === 'turnStarted')).toBe(false);
  });

  it('keeps a line decided while the link is down, and answers it when the link is back', async () => {
    const harness = start();
    harness.browser({ type: 'pulse', ...STAMP, hearsAgent: true });
    press(harness);
    harness.browser({ type: 'pulse', ...STAMP, hearsAgent: false });
    await delay(1600);
    harness.ears({ type: 'words', text: 'It lands twice as far.', isFinal: true });
    letGo(harness);
    harness.ears({ type: 'lineFlushed' });
    expect(harness.brainRequests).toEqual([]);
    harness.browser({ type: 'pulse', ...STAMP, hearsAgent: true });
    await delay(300);
    expect(harness.brainRequests).toEqual(['It lands twice as far.']);
  }, 10_000);

  it('counts a hold as the room not being quiet', async () => {
    const harness = start({ quietLimitMs: 300 });
    await delay(200);
    press(harness);
    await delay(200);
    expect(harness.messages.some((message) => message.type === 'closingForQuiet')).toBe(false);
  });
});

describe('a tutor kept being cut by sound with no words', () => {
  async function cutWithNoWords(harness: Harness) {
    harness.ears({ type: 'voiceStarted' });
    await delay(TURN_TIMINGS.wordlessStopMs + 30);
    harness.ears({ type: 'voiceEnded' });
    await delay(TURN_TIMINGS.transcriptGraceMs + 30);
  }

  it('tells the page once, on the second such cut and not the first', async () => {
    const harness = start();
    const countNotes = () => harness.messages.filter((message) => message.type === 'keptBeingCut').length;
    const speakThenCut = async () => {
      await harness.say('Why does it fall');
      await delay(TURN_TIMINGS.reactionFloorMs + 500);
      await cutWithNoWords(harness);
      await delay(1100);
    };
    await speakThenCut();
    expect(countNotes()).toBe(0);
    await speakThenCut();
    expect(countNotes()).toBe(1);
    await speakThenCut();
    expect(countNotes()).toBe(1);
  }, 20_000);

  it('says nothing to a student who already holds to talk', async () => {
    const harness = start();
    harness.browser({ type: 'holdStarted', ...STAMP });
    harness.browser({ type: 'lineEnded', ...STAMP });
    harness.session.onEars({ type: 'lineFlushed' });
    const speakThenCut = async () => {
      await harness.say('Why does it fall');
      await delay(TURN_TIMINGS.reactionFloorMs + 500);
      await cutWithNoWords(harness);
      await delay(1100);
    };
    await speakThenCut();
    await speakThenCut();
    expect(harness.messages.some((message) => message.type === 'keptBeingCut')).toBe(false);
  }, 20_000);
});

describe('the spoken invitation', () => {
  const kinds = (harness: Harness) => harness.traces.filter((trace) => trace.name === 'turnStarted').map((trace) => trace.fields.kind);
  const hello = (harness: Harness, invitesTalk: boolean) => harness.browser({ type: 'hello', ...STAMP, wantsGreeting: false, invitesTalk });
  const soundOn = (harness: Harness) => harness.browser({ type: 'audioState', ...STAMP, isRunning: true });
  const answerTyped = async (harness: Harness) => {
    harness.browser({ type: 'typed', ...STAMP, text: 'Why' });
    await delay(1500);
  };

  it('comes once, after the first answer, and tells the page so it can be recorded', async () => {
    const harness = start({ replyLine: 'one two' });
    soundOn(harness);
    hello(harness, true);
    await answerTyped(harness);
    await delay(1800);
    expect(kinds(harness)).toContain('talkInvitation');
    await delay(3000);
    expect(harness.messages.filter((message) => message.type === 'talkInvited')).toHaveLength(1);
    hello(harness, true);
    await answerTyped(harness);
    await delay(1800);
    expect(kinds(harness).filter((kind) => kind === 'talkInvitation')).toHaveLength(1);
  }, 15_000);

  it('does not come after a press and a rejoin, whatever a stale page says', async () => {
    const harness = start({ replyLine: 'one two' });
    soundOn(harness);
    harness.browser({ type: 'talkPressed', ...STAMP });
    hello(harness, true);
    await answerTyped(harness);
    await delay(1800);
    expect(kinds(harness)).not.toContain('talkInvitation');
  }, 10_000);

  it('does not come for a student the server says is not due one', async () => {
    const harness = start({ replyLine: 'one two' });
    soundOn(harness);
    hello(harness, false);
    await answerTyped(harness);
    await delay(1800);
    expect(kinds(harness)).not.toContain('talkInvitation');
  }, 10_000);

  it('does not come once the student has pressed Talk', async () => {
    const harness = start({ replyLine: 'one two' });
    soundOn(harness);
    hello(harness, true);
    harness.browser({ type: 'talkPressed', ...STAMP });
    await answerTyped(harness);
    await delay(1800);
    expect(kinds(harness)).not.toContain('talkInvitation');
  }, 10_000);

  it('does not come to a student who cannot hear it', async () => {
    const harness = start({ replyLine: 'one two' });
    hello(harness, true);
    await answerTyped(harness);
    await delay(1800);
    expect(kinds(harness)).not.toContain('talkInvitation');
  }, 10_000);

  it('waits for the last stretch of the first answer, not the breath before it', async () => {
    const stretches = [makeBeat('first', 'one two'), { ...makeBeat('second', 'three four'), pauseBeforeMs: 1800 }];
    const harness = start({ tutorBeats: stretches });
    soundOn(harness);
    hello(harness, true);
    harness.browser({ type: 'typed', ...STAMP, text: 'Why' });
    await delay(3000);
    expect(kinds(harness)).not.toContain('talkInvitation');
    await delay(2500);
    const order = kinds(harness);
    expect(order.at(-1)).toBe('talkInvitation');
    expect(order.filter((kind) => kind === 'reply')).toHaveLength(2);
  }, 15_000);

  it('never speaks over a reply the student asked for during its wait', async () => {
    const harness = start({ replyLine: LONG_LINE });
    soundOn(harness);
    hello(harness, true);
    harness.browser({ type: 'typed', ...STAMP, text: 'Why' });
    await delay(1500);
    harness.browser({ type: 'typed', ...STAMP, text: 'And then' });
    await delay(1000);
    expect(kinds(harness)).not.toContain('talkInvitation');
  }, 10_000);

  it('does not come from a tutor that has closed, which could not answer a press', async () => {
    const harness = start({ replyLine: 'one two', closedReason: 'sessionLimit' });
    soundOn(harness);
    hello(harness, true);
    harness.browser({ type: 'typed', ...STAMP, text: 'Why' });
    await delay(3000);
    expect(kinds(harness)).not.toContain('talkInvitation');
  }, 10_000);

  it('never follows the greeting alone, which is not an answer', async () => {
    const harness = start({ replyLine: 'one two' });
    soundOn(harness);
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: true, invitesTalk: true });
    await delay(3500);
    expect(kinds(harness)).toEqual(['greeting']);
  }, 10_000);
});

