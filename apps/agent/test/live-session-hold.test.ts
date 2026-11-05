import { type TurnId } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { TURN_TIMINGS } from '../src/live/turn-rule.ts';
import { delay, type Harness, LONG_LINE, makeBeat, STAMP, start } from './live-session-harness.ts';

// In its own file so a worker can run it beside the other live session tests, which keeps api-and-agent inside its limit.
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

  it('still says a limit line that a hold cut, because it may be the only help this student hears', async () => {
    const harness = start({ replyLine: 'Please tell an adult you trust.', closedReason: 'sessionLimit' });
    harness.browser({ type: 'typed', ...STAMP, text: 'Why' });
    await delay(150);
    press(harness);
    letGo(harness);
    harness.ears({ type: 'words', text: 'i took some pills', isFinal: true });
    harness.session.onEars({ type: 'lineFlushed' });
    await delay(TURN_TIMINGS.transcriptGraceMs + 1500);
    expect(harness.brainRequests).toEqual(['Why']);
    const kinds = harness.traces.filter((trace) => trace.name === 'turnStarted').map((trace) => trace.fields.kind);
    expect(kinds.at(-1)).toBe('resume');
    expect(harness.messages.filter((message) => message.type === 'tutorClosed').length).toBeGreaterThan(0);
  }, 10_000);

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

  it('takes no scene while the words of a released hold are still on their way', () => {
    const harness = start();
    expect(harness.session.isAtPause()).toBe(true);
    harness.browser({ type: 'holdStarted', ...STAMP });
    harness.browser({ type: 'lineEnded', ...STAMP });
    expect(harness.session.speakScene([makeBeat('scene-0', 'Watch this line tilt.')])).toBe(false);
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

  async function cutThenHear(harness: Harness, words: string) {
    await harness.say('Why does it fall');
    await delay(TURN_TIMINGS.reactionFloorMs + 500);
    harness.ears({ type: 'voiceStarted' });
    await delay(TURN_TIMINGS.wordlessStopMs + 30);
    harness.ears({ type: 'voiceEnded' });
    harness.ears({ type: 'words', text: words, isFinal: true });
    harness.ears({ type: 'turnDecided', text: words });
    await delay(100);
  }

  it('counts a cut that left one stray word, because babble often gives Muse one', async () => {
    const harness = start();
    await cutThenHear(harness, 'velocity');
    await cutThenHear(harness, 'velocity');
    expect(harness.messages.filter((message) => message.type === 'keptBeingCut')).toHaveLength(1);
  }, 20_000);

  it('does not count a cut that became a real line, because that is a student talking', async () => {
    const harness = start();
    await cutThenHear(harness, 'wait so what happens next');
    await cutThenHear(harness, 'and then what comes after');
    expect(harness.messages.some((message) => message.type === 'keptBeingCut')).toBe(false);
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

  it('does not follow a crisis reply, or the lesson the student goes back to after one', async () => {
    const harness = start({ replyLines: ['That sounds serious. Please tell an adult you trust.', 'one two'] });
    soundOn(harness);
    hello(harness, true);
    await answerTyped(harness);
    await delay(1800);
    expect(kinds(harness)).not.toContain('talkInvitation');
    harness.browser({ type: 'typed', ...STAMP, text: 'Can we carry on' });
    await delay(3300);
    expect(kinds(harness).filter((kind) => kind === 'reply')).toHaveLength(2);
    expect(kinds(harness)).not.toContain('talkInvitation');
    expect(harness.messages.filter((message) => message.type === 'talkInvited')).toHaveLength(0);
  }, 15_000);

  it('does not follow a lesson the student goes to after cutting a crisis reply short', async () => {
    const harness = start({ replyLines: [`Are you safe right now? ${LONG_LINE} ${LONG_LINE}`, 'one two'] });
    soundOn(harness);
    hello(harness, true);
    harness.browser({ type: 'typed', ...STAMP, text: 'Why' });
    await delay(900);
    harness.browser({ type: 'typed', ...STAMP, text: 'Can we carry on' });
    await delay(3500);
    expect(kinds(harness)).toContain('reply');
    expect(kinds(harness)).not.toContain('talkInvitation');
  }, 15_000);

  it('never follows the greeting alone, which is not an answer', async () => {
    const harness = start({ replyLine: 'one two' });
    soundOn(harness);
    harness.browser({ type: 'hello', ...STAMP, wantsGreeting: true, invitesTalk: true });
    await delay(3500);
    expect(kinds(harness)).toEqual(['greeting']);
  }, 10_000);
});
