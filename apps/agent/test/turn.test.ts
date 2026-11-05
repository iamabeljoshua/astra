import { describe, expect, it } from 'vitest';
import { createEchoFilter } from '../src/live/echo-filter.ts';
import { getNextTurnState, INITIAL_TURN_STATE, MOST_WORDS_OWED, type TimerName, TURN_TIMINGS, type TurnAction, type TurnEvent, type TurnState } from '../src/live/turn-rule.ts';
import { hasWords, isFiller, isSmallReaction } from '../src/live/turn-words.ts';

const ON: TurnEvent = { type: 'voiceStarted' };
const OFF: TurnEvent = { type: 'voiceEnded' };
const THINKING: TurnEvent = { type: 'tutorThinking' };
const SPEAKING: TurnEvent = { type: 'tutorStarted', isReply: true };
const FINISHED: TurnEvent = { type: 'tutorFinished' };
const HEARD_OUT: TurnEvent = { type: 'replyHeardOut' };
const QUESTION_HEARD: TurnEvent = { type: 'questionHeard' };
const LINK_LOST: TurnEvent = { type: 'linkLost' };
const LINK_BACK: TurnEvent = { type: 'linkBack' };
const words = (text: string, isFinal = true): TurnEvent => ({ type: 'words', text, isFinal });
const decided = (text: string): TurnEvent => ({ type: 'turnDecided', text });
const timer = (name: TimerName): TurnEvent => ({ type: 'timer', name });

function describeAction(action: TurnAction): string | null {
  if (action.do === 'cancelTimer' || action.do === 'setTurnCap') return null;
  if (action.do === 'startTimer') return `start ${action.name}`;
  if (action.do === 'stop') return `stop: ${action.reason}`;
  if (action.do === 'reply') return `reply ${action.via}: ${action.text}`;
  return action.do;
}

function play(events: readonly TurnEvent[]) {
  let state = INITIAL_TURN_STATE;
  const heard: string[] = [];
  for (const event of events) {
    const next = getNextTurnState(state, event);
    state = next.state;
    heard.push(...next.actions.map(describeAction).filter((action): action is string => action !== null));
  }
  return { actions: heard, phase: state.phase, state };
}

const WORDLESS = 'start wordlessStop';
const GRACE = 'start transcriptGrace';
const HELD = 'start heldFinal';
const FLOOR = 'start reactionFloor';

describe('a backchannel', () => {
  it('lowers the voice and does not stop the tutor', () => {
    expect(play([SPEAKING, ON, OFF, words('Uh-huh.')]).actions).toEqual(['yield', WORDLESS, GRACE, 'unyield']);
  });

  it('does not stop the tutor over a question, until its last word has been heard', () => {
    expect(play([SPEAKING, ON, words('Hmm', false), OFF, timer('transcriptGrace')]).actions).toEqual(['yield', WORDLESS, GRACE, 'unyield']);
  });

  it.each(['Uh-huh', 'Mm-hmm', 'Mhmm', 'Hm', 'Mmm', 'Um', 'Oh', 'I see', 'Got it', 'Aha', 'Mm-mm', 'Yeah, yeah', 'Okay.', 'MM.', 'MMMM.', 'Hmmmm', 'Aha, MMM', 'Mhm', 'Mm hum', ' Hum.'])('takes "%s" as a reaction', (text) => {
    expect(isSmallReaction(text)).toBe(true);
    expect(play([SPEAKING, ON, words(text, false)]).phase).toBe('yielding');
  });

  it('asks the transcriber to stay open, because a new Muse session takes over a second', () => {
    const { actions } = play([SPEAKING, ON, words('Uh-huh.'), OFF]);
    expect(actions.join()).not.toContain('clear');
  });

  it('ends with no reply when the transcriber makes a turn of it', () => {
    const { actions } = play([SPEAKING, ON, words('Uh-huh.'), OFF, FINISHED, decided('Uh-huh.')]);
    expect(actions.some((action) => action.startsWith('reply'))).toBe(false);
  });

  it('is not an interruption when it has no words at all', () => {
    expect(hasWords('...')).toBe(false);
    expect(hasWords('-')).toBe(false);
    expect(isSmallReaction('...')).toBe(false);
    expect(play([SPEAKING, ON, words('...', false)]).phase).toBe('yielding');
  });

  it('counts "uh - huh" as a reaction, not as a real word', () => {
    expect(isSmallReaction('uh - huh')).toBe(true);
  });
});

describe('words a cut reply still owes', () => {
  const replyTo = (text: string): TurnEvent[] => [decided(text), SPEAKING, ON, words('Wait', false), FINISHED, OFF];
  const lastReply = (actions: string[]) => actions.filter((action) => action.startsWith('reply')).at(-1) ?? '';

  it('keeps only the newest of them, so a student cut 40 times is not answered on 200 words', () => {
    const cuts = Array.from({ length: 40 }, (_, cut) => replyTo(`line ${cut} has five words`)).flat();
    const { actions, state } = play([...cuts, decided('And now?')]);
    const reply = lastReply(actions).replace('reply final: ', '').split(' ');
    expect(reply).toHaveLength(MOST_WORDS_OWED + 2);
    expect(reply.slice(-7).join(' ')).toBe('line 39 has five words And now?');
    expect(state.unanswered.split(' ')).toHaveLength(MOST_WORDS_OWED);
  });

  it('never cuts what the student just said, however long', () => {
    const long = Array.from({ length: MOST_WORDS_OWED + 40 }, (_, word) => `w${word}`).join(' ');
    expect(lastReply(play([decided(long)]).actions)).toBe(`reply final: ${long}`);
  });

  it('are kept through a filler and the prompt after it, because a stored line answers nothing', () => {
    const { actions } = play([...replyTo('Why does it fall?'), decided('Hmm, let me think'), timer('patience'), SPEAKING, FINISHED, ON, OFF, decided('And the moon?')]);
    expect(actions).toContain('promptAfterSilence');
    expect(lastReply(actions)).toBe('reply final: Why does it fall? And the moon?');
  });

  it('are gone once a reply has been heard to its end', () => {
    const { actions } = play([...replyTo('Why does it fall?'), decided('And the moon?'), SPEAKING, HEARD_OUT, FINISHED, ON, OFF, decided('And the sun?')]);
    expect(lastReply(actions)).toBe('reply final: And the sun?');
  });
});

describe('words that are not reactions', () => {
  it.each(['Wait', 'Why', 'No', 'Stop', 'Gravity', '42', 'x', 'math', 'huh why', 'okay but why'])('takes "%s" as a real word', (text) => {
    expect(isSmallReaction(text)).toBe(false);
  });
});

describe('a real word', () => {
  it('stops the tutor on the first partial', () => {
    expect(play([SPEAKING, ON, words('Wait, then', false)]).actions).toEqual(['yield', WORDLESS, 'stop: real word']);
  });

  it('stops the tutor when a number stands alone, because digits are real words', () => {
    expect(isSmallReaction('42.')).toBe(false);
    expect(isSmallReaction('9.8')).toBe(false);
    expect(play([SPEAKING, ON, words('42.', false)]).actions).toEqual(['yield', WORDLESS, 'stop: real word']);
  });

  it('stops a reply still thinking, and the next reply carries the words it never answered', () => {
    const { actions } = play([decided('Gravity.'), THINKING, ON, words('It lands', false), OFF, words('It lands twice as far.'), decided('It lands twice as far.')]);
    expect(actions).toEqual(['react', 'reply final: Gravity.', 'stop: real word', HELD, 'reply final: Gravity. It lands twice as far.']);
  });

  it('answers the whole thought when the tutor jumped in on a pause and the student carried on over the reply', () => {
    const { actions } = play([ON, OFF, words('I think it lands.'), decided('I think it lands.'), THINKING, SPEAKING, ON, words('twice as far', false), OFF, words('twice as far because the speed doubled.'), decided('twice as far because the speed doubled.')]);
    expect(actions.at(-1)).toBe('reply final: I think it lands. twice as far because the speed doubled.');
  });

  it('says which words a reply carries, so the brain can tell them from the new ones', () => {
    const steps = [decided('Gravity.'), THINKING, ON, words('It lands', false), OFF, words('It lands twice as far.')];
    const state = steps.reduce((current, event) => getNextTurnState(current, event).state, INITIAL_TURN_STATE);
    const { actions } = getNextTurnState(state, decided('It lands twice as far.'));
    expect(actions).toContainEqual({ do: 'reply', text: 'Gravity. It lands twice as far.', carried: 'Gravity.', via: 'final' });
  });

  it('does not carry words the tutor finished answering', () => {
    const { actions } = play([decided('Why does it fall?'), THINKING, SPEAKING, HEARD_OUT, FINISHED, ON, OFF, words('And the moon?'), decided('And the moon?')]);
    expect(actions.at(-1)).toBe('reply final: And the moon?');
  });

  it('stops however late the words arrive', () => {
    expect(play([SPEAKING, ON, OFF, timer('transcriptGrace'), words('Wait.')]).actions).toEqual(['yield', WORDLESS, GRACE, 'unyield', 'stop: real word']);
  });

  it('"yes" is a reaction before the question is heard and an answer after', () => {
    expect(play([SPEAKING, ON, words('Yes.'), OFF]).phase).toBe('clear');
    const answer = play([SPEAKING, QUESTION_HEARD, ON, words('Yes.')]);
    expect(answer.phase).toBe('stopped');
    expect(answer.actions.at(-1)).toBe('stop: real word');
  });

  it('forgets the last question heard when a new reply starts', () => {
    expect(play([SPEAKING, QUESTION_HEARD, FINISHED, decided('Why?'), SPEAKING, ON, words('Yes.'), OFF]).phase).toBe('clear');
  });
});

describe('words that lag the voice', () => {
  it('do not stop the reaction to the speech they came from', () => {
    const { actions } = play([ON, words('why does', false), OFF, timer('reactionFloor'), { type: 'tutorStarted', isReply: false }, words('why does it come', false), words('Why does it come down?')]);
    expect(actions).toEqual([FLOOR, HELD, 'react', HELD]);
  });

  it('do not stop the answer to the speech they came from, or the tutor would answer nothing', () => {
    const { actions, state } = play([ON, words('why does it', false), OFF, timer('heldFinal'), words('Why does it come down?')]);
    expect(actions).not.toContain('stop: real word');
    expect(state.tutor).toBe('thinking');
  });

  it('do stop the tutor once the student has started speaking again', () => {
    const { actions } = play([ON, words('why', false), OFF, timer('heldFinal'), SPEAKING, ON, words('Wait', false)]);
    expect(actions.at(-1)).toBe('stop: real word');
  });
});

describe('a final Muse holds back', () => {
  it('acts on the partial once the voice has been quiet for the bound', () => {
    const { actions, state } = play([ON, words('why does it come', false), OFF, timer('heldFinal')]);
    expect(actions).toEqual([FLOOR, HELD, 'react', 'reply partial: why does it come']);
    expect(state.tutor).toBe('thinking');
  });

  it('replaces stop, resume, stop with one stop and an answer, because real words never resume', () => {
    const { actions } = play([SPEAKING, ON, words('Wait then', false), OFF, timer('heldFinal')]);
    expect(actions).toEqual(['yield', WORDLESS, 'stop: real word', HELD, FLOOR, 'react', 'reply partial: Wait then']);
    expect(actions).not.toContain('resume');
  });

  it('does not answer the same words twice when the held final lands', () => {
    const { actions } = play([ON, words('why does it', false), OFF, timer('heldFinal'), words('Why does it come down?'), decided('Why does it come down?')]);
    expect(actions.filter((action) => action.startsWith('reply'))).toEqual(['reply partial: why does it']);
  });

  it('keeps what the student said after a held final that lands late, with the answered words taken off', () => {
    const { actions } = play([ON, words('why does it', false), OFF, timer('heldFinal'), SPEAKING, HEARD_OUT, FINISHED, ON, OFF, decided('why does it come down? And what about the ball?')]);
    expect(actions.filter((action) => action.startsWith('reply')).at(-1)).toBe('reply final: come down? And what about the ball?');
  });

  it('waits when more speech comes within the bound', () => {
    const { actions } = play([ON, words('why does', false), OFF, ON, timer('heldFinal')]);
    expect(actions.some((action) => action.startsWith('reply'))).toBe(false);
  });

  it('needs a partial, so silence alone never starts a reply', () => {
    expect(play([ON, OFF, timer('heldFinal')]).actions.some((action) => action.startsWith('reply'))).toBe(false);
  });
});

describe('sound with no words', () => {
  it('cuts the tutor after the bound, and carries on if no words come', () => {
    expect(play([SPEAKING, ON, timer('wordlessStop'), OFF, timer('transcriptGrace')]).actions).toEqual(['yield', WORDLESS, 'stop: no words', GRACE, 'resume']);
  });

  it('releases a short cough with no cut', () => {
    expect(play([SPEAKING, ON, OFF, timer('transcriptGrace')]).actions).toEqual(['yield', WORDLESS, GRACE, 'unyield']);
  });

  it('turns to an answer if words come after the cut', () => {
    expect(play([SPEAKING, ON, timer('wordlessStop'), words('Wait, why'), OFF, decided('Wait, why')]).actions).toEqual(['yield', WORDLESS, 'stop: no words', FLOOR, 'react', 'reply final: Wait, why'].filter((action) => action !== FLOOR || true));
  });

  it('resumes at once on a reaction after the cut', () => {
    expect(play([SPEAKING, ON, timer('wordlessStop'), OFF, words('Mm.')]).actions).toEqual(['yield', WORDLESS, 'stop: no words', GRACE, 'resume']);
  });
});

describe('reacting first', () => {
  it('reacts again on the next turn', () => {
    const { actions } = play([ON, words('why', false), OFF, timer('reactionFloor'), decided('Why?'), SPEAKING, FINISHED, ON, words('and how', false), OFF, timer('reactionFloor')]);
    expect(actions.filter((action) => action === 'react')).toHaveLength(2);
  });

  it('reacts after the floor when the student has said something', () => {
    expect(play([ON, words('why', false), OFF, timer('reactionFloor')]).actions).toEqual([FLOOR, HELD, 'react']);
  });

  it('reacts once, and not again on the reply', () => {
    const { actions } = play([ON, words('why', false), OFF, timer('reactionFloor'), words('Why?'), decided('Why?')]);
    expect(actions.filter((action) => action === 'react')).toHaveLength(1);
    expect(actions.at(-1)).toBe('reply final: Why?');
  });

  it('does not react to a voice with no words, and does when the words land', () => {
    expect(play([ON, OFF, timer('reactionFloor')]).actions).toEqual([FLOOR]);
    expect(play([ON, OFF, timer('reactionFloor'), words('Wait', false)]).actions).toEqual([FLOOR, HELD, 'react']);
  });

  it('reacts at once to typed words, and stops a tutor that was talking', () => {
    expect(play([SPEAKING, { type: 'typed', text: 'Why?' }]).actions).toEqual(['stop: typed', 'react', 'reply typed: Why?']);
    expect(play([{ type: 'typed', text: 'Why?' }]).actions).toEqual(['react', 'reply typed: Why?']);
  });
});

describe('patience', () => {
  it('holds the floor for a filler, with no reply', () => {
    expect(isFiller('Hmm, let me think')).toBe(true);
    const { actions } = play([ON, words('Hmm, let me think'), OFF, decided('Hmm, let me think')]);
    expect(actions).toContain('start patience');
    expect(actions).toContain('noteQuietLine');
    expect(actions).not.toContain('reply');
  });

  it('says nothing after asking a question, however long the student takes, because the page shows the prompt', () => {
    const { actions } = play([SPEAKING, QUESTION_HEARD, FINISHED, timer('patience'), timer('patience')]);
    expect(actions).not.toContain('start patience');
    expect(actions).not.toContain('promptAfterSilence');
  });

  it('any sound starts the wait again after a filler', () => {
    const { actions } = play([ON, words('Hmm, let me think'), OFF, decided('Hmm, let me think'), ON, OFF]);
    expect(actions.filter((action) => action === 'start patience').length).toBeGreaterThanOrEqual(2);
  });

  it('prompts once when the wait after a filler ends', () => {
    const FILLER = [ON, words('Hmm, let me think'), OFF, decided('Hmm, let me think'), timer('reactionFloor')];
    expect(play([...FILLER, timer('patience')]).actions.at(-1)).toBe('promptAfterSilence');
    expect(play([...FILLER, timer('patience'), timer('patience')]).actions.filter((action) => action === 'promptAfterSilence')).toHaveLength(1);
  });

  it('allows 2 s after a question or an interruption, and 1 s otherwise', () => {
    let state = INITIAL_TURN_STATE;
    const caps = ([QUESTION_HEARD, words('Why?'), decided('Why?')] as TurnEvent[]).flatMap((event) => {
      const next = getNextTurnState(state, event);
      state = next.state;
      return next.actions.flatMap((action) => (action.do === 'setTurnCap' ? [action.ms] : []));
    });
    expect(caps).toEqual([TURN_TIMINGS.patientTurnCapMs, TURN_TIMINGS.turnCapMs]);
  });
});

describe('a dropped link', () => {
  it('pauses a tutor that was talking, and resumes on return', () => {
    expect(play([SPEAKING, LINK_LOST, LINK_BACK]).actions).toEqual(['stop: link lost', 'resume']);
  });

  it('does nothing for a silent tutor', () => {
    expect(play([LINK_LOST, LINK_BACK]).actions).toEqual([]);
  });

  it('ignores sound while away', () => {
    expect(play([SPEAKING, LINK_LOST, ON, words('Wait', false), OFF, LINK_BACK]).actions).toEqual(['stop: link lost', 'resume']);
  });
});

describe('the echo filter', () => {
  it('knows the tutor\'s own words in order, and not other words', () => {
    const filter = createEchoFilter();
    filter.noteTutorWords(['The', 'ball', 'leaves', 'your', 'hand.'], 1000);
    expect(filter.isEcho('ball leaves your', 1500)).toBe(true);
    expect(filter.isEcho('why the ball', 1500)).toBe(false);
  });

  it('takes one word as the student, because one could match by chance', () => {
    const filter = createEchoFilter();
    filter.noteTutorWords(['Wait', 'for', 'it.'], 1000);
    expect(filter.isEcho('Wait', 1500)).toBe(false);
  });

  it('forgets words said long ago', () => {
    const filter = createEchoFilter();
    filter.noteTutorWords(['The', 'ball'], 1000);
    expect(filter.isEcho('the ball', 8000)).toBe(false);
  });

  it('lets the rule treat an echo as no interruption', () => {
    const { actions, phase } = play([SPEAKING, ON, { type: 'echoHeard' }, OFF, timer('transcriptGrace')]);
    expect(actions).toEqual(['yield', WORDLESS, GRACE, 'unyield']);
    expect(phase).toBe('clear');
  });
});

/** Shortest orders first, so this bound keeps every short story. `FULL_SEARCH=1` walks them all, in about 15 s. */
const MOST_STATES_IN_CI = 2500;

function searchEveryOrder(mostStates: number) {
  type Node = { state: TurnState; armed: TimerName[]; isYielded: boolean; isCut: boolean; path: string[] };
  const violations: Record<string, string[][]> = { realWordsNotStopped: [], reactionStopped: [], resumeWhileVoiceOn: [], doubleYield: [], stopWhileSilent: [], stuckYielded: [], silentForever: [], doubleReply: [] };
  const seen = new Set<string>();
  const queue: Node[] = [{ state: INITIAL_TURN_STATE, armed: [], isYielded: false, isCut: false, path: [] }];
  const stepTutor: TurnEvent[] = [THINKING, SPEAKING, { type: 'tutorStarted', isReply: false }, HEARD_OUT, FINISHED];
  const key = ({ state, armed, isYielded, isCut }: Node) => JSON.stringify([state, [...armed].sort(), isYielded, isCut]);
  // Words pile up in the state, and only whether there are any changes what the rule does.
  const withBoundedWords = (state: TurnState): TurnState => ({ ...state, unanswered: state.unanswered ? 'Wait why' : '', answeredPartial: state.answeredPartial === null ? null : 'Wait why' });
  let moves = 0;
  for (let next = 0; next < queue.length && seen.size < mostStates; next += 1) {
    const node = queue[next] as Node;
    if (seen.has(key(node))) continue;
    seen.add(key(node));
    const options: TurnEvent[] = [node.state.isVoiceOn ? OFF : ON, words('Wait why'), words('Wait why', false), words('Uh-huh.'), words('Uh-huh', false), QUESTION_HEARD, LINK_LOST, LINK_BACK, decided('Wait why'), ...stepTutor, ...node.armed.map(timer)];
    for (const move of options) {
      moves += 1;
      const next = getNextTurnState(node.state, move);
      const armed = new Set(node.armed);
      if (move.type === 'timer') armed.delete(move.name);
      let { isYielded, isCut } = node;
      const wasActive = node.state.tutor !== 'silent';
      const path = [...node.path.slice(-8), move.type === 'timer' ? `timer:${move.name}` : move.type === 'words' ? move.text : move.type];
      const hasStop = next.actions.some((action) => action.do === 'stop');
      for (const action of next.actions) {
        if (action.do === 'startTimer') armed.add(action.name);
        if (action.do === 'cancelTimer') armed.delete(action.name);
        if (action.do === 'yield') {
          if (isYielded) violations.doubleYield?.push(path);
          isYielded = true;
        }
        if (action.do === 'unyield') isYielded = false;
        if (action.do === 'stop') {
          if (!wasActive) violations.stopWhileSilent?.push(path);
          isCut = true;
          isYielded = false;
        }
        if (action.do === 'resume') {
          if (next.state.isVoiceOn) violations.resumeWhileVoiceOn?.push(path);
          isCut = false;
        }
        if (action.do === 'reply') isCut = false;
      }
      if (move.type === 'linkLost' || (move.type === 'linkBack' && node.state.phase === 'away') || (move.type === 'tutorStarted' && move.isReply)) {
        isCut = next.state.phase === 'held';
        isYielded = next.state.phase === 'yielding';
      }
      const isNewSpeech = node.state.answering === 'no' || node.state.isVoiceOn;
      if (move.type === 'words' && move.text === 'Wait why' && wasActive && isNewSpeech && !node.isCut && node.state.phase !== 'away' && !hasStop && !node.state.isQuestionHeard) violations.realWordsNotStopped?.push(path);
      if (move.type === 'words' && move.text.startsWith('Uh-huh') && hasStop && !node.state.isQuestionHeard) violations.reactionStopped?.push(path);
      if (next.actions.filter((action) => action.do === 'reply').length > 1) violations.doubleReply?.push(path);
      const isStuck = armed.size === 0 && !next.state.isVoiceOn && isYielded && next.state.tutor === 'speaking' && next.state.phase === 'yielding';
      if (isStuck) violations.stuckYielded?.push(path);
      const isSilent = armed.size === 0 && !next.state.isVoiceOn && next.state.tutor === 'silent' && next.state.phase === 'held';
      if (isSilent) violations.silentForever?.push(path);
      queue.push({ state: withBoundedWords(next.state), armed: [...armed], isYielded, isCut, path });
    }
  }
  return { states: seen.size, moves, violations };
}

describe('every order of events', () => {
  it('breaks none of the rules', { timeout: 120_000 }, () => {
    const { states, moves, violations } = searchEveryOrder(process.env.FULL_SEARCH ? Infinity : MOST_STATES_IN_CI);
    if (process.env.FULL_SEARCH) console.log(`searched ${states} states and ${moves} moves`);
    const found = Object.fromEntries(Object.entries(violations).flatMap(([name, paths]) => (paths.length > 0 ? [[name, { count: paths.length, shortest: [...paths].sort((first, second) => first.length - second.length)[0] }]] : [])));
    expect(found).toEqual({});
    expect(states).toBeGreaterThan(200);
    expect(moves).toBeGreaterThan(2000);
  });
});

describe('which reaction a turn may get', () => {
  const getReaction = (events: readonly TurnEvent[]) => {
    let state = INITIAL_TURN_STATE;
    let reaction: TurnAction | undefined;
    for (const event of events) {
      const next = getNextTurnState(state, event);
      state = next.state;
      reaction = next.actions.find((action) => action.do === 'react') ?? reaction;
    }
    return reaction as (TurnAction & { do: 'react' }) | undefined;
  };
  const typed = (text: string): TurnEvent => ({ type: 'typed', text });

  it('is the same for speech and for a typed line, and says nothing of what the words are', () => {
    expect(getReaction([ON, OFF, words('Why does it fall?'), timer('reactionFloor')])).toEqual({ do: 'react' });
    expect(getReaction([typed('Why does a ball slow down?')])).toEqual({ do: 'react' });
    expect(getReaction([SPEAKING, QUESTION_HEARD, FINISHED, typed('Is it five because of the slope?')])).toEqual({ do: 'react' });
  });
});
