import { type AgentMessage, type Beat, type BrowserMessage, type SessionEvent, type TurnId } from '@astra/contracts';
import { tts } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';
import { QUIET_ROOM_LIMIT_MS, VOICE_STALL_MS } from '../src/live/live-session.ts';
import { TURN_TIMINGS } from '../src/live/turn-rule.ts';
import { delay, type Harness, LONG_LINE, makeBeat, STAMP, start } from './live-session-harness.ts';

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

  it('tells the page about cost only when a tester asked, and once a reply', async () => {
    const asked = start({ getCostSoFar: () => 0.04, tutorBeats: [makeBeat('short', 'one two three')] });
    await asked.say('Show me a long answer');
    await until(() => asked.traces.some(({ name, fields }) => name === 'turnFinished' && fields.kind === 'reply'));
    expect(asked.messages.filter(({ type }) => type === 'costSoFar')).toEqual([{ type: 'costSoFar', usd: 0.04 }]);
    const silent = start({ tutorBeats: [makeBeat('short', 'one two three')] });
    await silent.say('Show me a long answer');
    await until(() => silent.traces.some(({ name, fields }) => name === 'turnFinished' && fields.kind === 'reply'));
    expect(silent.messages.filter(({ type }) => type === 'costSoFar')).toEqual([]);
  });

  it('logs a beat that starts a new stretch, because a replay needs every word that played', async () => {
    const secondStretch = { ...makeBeat('second', 'And the next idea.'), pauseBeforeMs: 0 };
    const { session, say, traces } = start({ tutorBeats: [makeBeat('first', 'one two three'), secondStretch] });
    await say('Show me a long answer');
    await until(() => traces.filter(({ name, fields }) => name === 'turnStarted' && fields.kind === 'reply').length === 2);
    const turnId = traces.filter(({ name, fields }) => name === 'turnStarted' && fields.kind === 'reply').at(-1)?.fields.turnId as never;
    session.onBrowser({ type: 'played', turnId, beatId: 'second' as never, wordStartsMs: [0, 100, 200, 300], durationMs: 400, playedWords: 4, firedCueMs: [], ending: 'finished', frozen: [], clockId: 'c', browserMs: 10, startedMsAgo: 0 });
    expect(traces.filter(({ name }) => name === 'reportRefused')).toEqual([]);
    expect(session.getLog().some((event) => event.kind === 'beatPlayed' && event.beat.id === 'second')).toBe(true);
  });

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

describe('the reaction to a typed line', () => {
  const STAMP_TYPED = (text: string): BrowserMessage => ({ type: 'typed', text, ...STAMP });
  const until = async (isDone: () => boolean) => {
    for (let waited = 0; waited < 15_000 && !isDone(); waited += 10) await delay(10);
  };
  const kinds = (traces: Harness['traces']) => traces.filter(({ name }) => name === 'turnStarted').map(({ fields }) => fields.kind);

  it('is neutral, because it plays before the tutor has read the line', async () => {
    const { browser, traces } = start();
    browser(STAMP_TYPED('hello there'));
    await until(() => kinds(traces).includes('reply'));
    traces.length = 0;
    browser(STAMP_TYPED('how many sleeping pills is too many?'));
    await until(() => kinds(traces).includes('reply'));
    expect(kinds(traces)).toEqual(['reaction', 'reply']);
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

  it('tells the tutor when a new page clock says hello, because that is a reload with the board in its hands', async () => {
    const harness = start();
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: true, invitesTalk: false });
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: false, invitesTalk: false });
    expect(harness.cameBack).toBe(0);
    harness.browser({ type: 'hello', ...STAMP, clockId: 'next-page', wantsGreeting: true, invitesTalk: false });
    expect(harness.cameBack).toBe(1);
  });

  it('stays quiet for a student who opened the room by typing', async () => {
    const harness = start();
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: false, invitesTalk: false });
    await delay(50);
    expect(harness.traces.filter((trace) => trace.name === 'turnStarted')).toEqual([]);
  });
});

describe('ending a session with a recap', () => {
  const STAMP_END = { clockId: 'page', browserMs: 1000, startedMsAgo: 0 };
  const RECAP = { kind: 'lesson', covered: 'We took three from both sides.', gotRight: null, tryNext: 'Try one more on your own.' } as const;
  const LESSON_WORDS = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ');
  const getRecapMessage = (messages: AgentMessage[]) => messages.find((message) => message.type === 'recap');

  async function playLesson(harness: ReturnType<typeof start>) {
    harness.browser({ type: 'typed', text: 'teach me', ...STAMP_END });
    const closed = await vi.waitFor(() => {
      const found = harness.messages.find((message) => message.type === 'beatClosed' && message.beatId === 'lesson');
      if (!found) throw new Error('the lesson has not played');
      return found as AgentMessage & { type: 'beatClosed' };
    }, { timeout: 3000 });
    const { turnId } = closed;
    harness.browser({ type: 'played', turnId, beatId: 'lesson' as Beat['id'], ...STAMP_END, wordStartsMs: LESSON_WORDS.split(' ').map((_, index) => index * 10), durationMs: 400, playedWords: 40, firedCueMs: [], ending: 'finished', frozen: [] });
    await delay(50);
  }

  it('takes no scene from the End press on, and tells what waits ahead to stop', async () => {
    let isOver = false;
    const onEnding = vi.fn();
    const harness = start({ tutorBeats: [makeBeat('lesson', LESSON_WORDS)], writeRecap: async () => RECAP, onEnding, onEndingOver: () => { isOver = true; } });
    const scene = [makeBeat('scene-0', 'Watch this line tilt.')];
    await playLesson(harness);
    harness.browser({ type: 'endingSession', ...STAMP_END });
    expect(onEnding).toHaveBeenCalledOnce();
    expect(harness.session.isAtPause()).toBe(false);
    expect(harness.session.speakScene(scene)).toBe(false);
    const recapTurn = await vi.waitFor(() => {
      const closed = harness.messages.find((message) => message.type === 'beatClosed' && message.beatId === 'recap-1');
      if (!closed) throw new Error('the recap has not played');
      return (closed as AgentMessage & { type: 'beatClosed' }).turnId;
    }, { timeout: 3000 });
    for (const beatId of ['recap-0', 'recap-1']) harness.browser({ type: 'played', turnId: recapTurn, beatId: beatId as Beat['id'], ...STAMP_END, wordStartsMs: [0], durationMs: 100, playedWords: 1, firedCueMs: [], ending: 'finished', frozen: [] });
    await vi.waitFor(() => expect(isOver).toBe(true), { timeout: 8000 });
    expect(harness.session.isAtPause()).toBe(false);
    expect(harness.session.speakScene(scene)).toBe(false);
    expect(harness.messages.some((message) => message.type === 'words' && message.beatId === 'scene-0')).toBe(false);
  }, 12_000);

  it('tells the page there is no recap and lets the room go, on a session with nothing in it', async () => {
    let isOver = false;
    const writeRecap = vi.fn(async () => RECAP);
    const harness = start({ writeRecap, onEndingOver: () => { isOver = true; } });
    harness.browser({ type: 'endingSession', ...STAMP_END });
    await delay(50);
    expect(getRecapMessage(harness.messages)).toEqual({ type: 'recap', recap: null });
    expect(writeRecap).not.toHaveBeenCalled();
    expect(isOver).toBe(true);
  });

  it('shows and speaks the recap as a turn of its own, then lets the room go, and the log holds it', async () => {
    let isOver = false;
    const onRecap = vi.fn();
    const harness = start({ tutorBeats: [makeBeat('lesson', LESSON_WORDS)], writeRecap: async () => RECAP, onRecap, onEndingOver: () => { isOver = true; } });
    await playLesson(harness);
    harness.browser({ type: 'endingSession', ...STAMP_END });
    await delay(100);
    expect(getRecapMessage(harness.messages)).toEqual({ type: 'recap', recap: RECAP });
    expect(onRecap).toHaveBeenCalledWith(RECAP);
    await vi.waitFor(() => {
      const recapTurn = harness.getTurnsStarted().at(-1) as TurnId;
      expect(harness.messages.flatMap((message) => (message.type === 'beatClosed' && message.turnId === recapTurn ? [message.beatId] : []))).toEqual(['recap-0', 'recap-1']);
    }, { timeout: 3000 });
    const recapTurn = harness.getTurnsStarted().at(-1) as TurnId;
    for (const beatId of ['recap-0', 'recap-1']) harness.browser({ type: 'played', turnId: recapTurn, beatId: beatId as Beat['id'], ...STAMP_END, wordStartsMs: [0], durationMs: 100, playedWords: 1, firedCueMs: [], ending: 'finished', frozen: [] });
    await vi.waitFor(() => expect(isOver).toBe(true), { timeout: 8000 });
  }, 12_000);

  it('hears nothing more from the student once ending, so no reply can start over the recap', async () => {
    const harness = start({ tutorBeats: [makeBeat('lesson', LESSON_WORDS)], writeRecap: async () => null });
    await playLesson(harness);
    const repliesBefore = harness.brainRequests.length;
    harness.browser({ type: 'endingSession', ...STAMP_END });
    harness.browser({ type: 'typed', text: 'one more thing', ...STAMP_END });
    await harness.say('and another thing');
    await delay(50);
    expect(harness.brainRequests).toHaveLength(repliesBefore);
  });

  it('asks for one recap however many times the page says it is ending', async () => {
    const writeRecap = vi.fn(async () => null);
    const harness = start({ tutorBeats: [makeBeat('lesson', LESSON_WORDS)], writeRecap });
    await playLesson(harness);
    harness.browser({ type: 'endingSession', ...STAMP_END });
    harness.browser({ type: 'endingSession', ...STAMP_END });
    await delay(50);
    expect(writeRecap).toHaveBeenCalledOnce();
  });

  it('goes on to no recap when the writer fails', async () => {
    let isOver = false;
    const harness = start({ tutorBeats: [makeBeat('lesson', LESSON_WORDS)], writeRecap: async () => { throw new Error('model down'); }, onEndingOver: () => { isOver = true; } });
    await playLesson(harness);
    harness.browser({ type: 'endingSession', ...STAMP_END });
    await delay(50);
    expect(getRecapMessage(harness.messages)).toEqual({ type: 'recap', recap: null });
    expect(isOver).toBe(true);
  });

  it('logs what the student typed and said as text, and leaves out the line the page opened with', async () => {
    const logged: SessionEvent[] = [];
    const harness = start({ onLogWritten: (event) => void logged.push(event) });
    harness.browser({ type: 'typed', text: 'Teach me fractions', isOpening: true, ...STAMP_END });
    harness.browser({ type: 'typed', text: 'what is a half', ...STAMP_END });
    await harness.say('and what about a third');
    await delay(50);
    const spoke = logged.flatMap((event) => (event.kind === 'studentSpoke' ? [[event.source, event.text]] : []));
    expect(spoke).toContainEqual(['typed', 'what is a half']);
    expect(spoke).toContainEqual(['voice', 'and what about a third']);
    expect(spoke.flat()).not.toContain('Teach me fractions');
  });
});
