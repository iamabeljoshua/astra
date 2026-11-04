import { describe, expect, it } from 'vitest';
import { getNextPress, INITIAL_PRESS, HOLD_LIMIT_MS, TAP_LIMIT_MS, type PressCommand, type PressEvent, type PressState } from './holdToTalk';

const run = (events: PressEvent[], start: PressState = INITIAL_PRESS) => {
  let state = start;
  const commands: PressCommand[] = [];
  for (const event of events) {
    const step = getNextPress(state, event);
    state = step.state;
    commands.push(...step.commands);
  }
  return { state, commands };
};

const pressTalk = (micIsOn = false): PressEvent => ({ type: 'pressed', source: 'talkButton', micIsOn });
const pressSpace = (micIsOn = false): PressEvent => ({ type: 'pressed', source: 'space', micIsOn });
const lose = (): PressEvent => ({ type: 'fingerLost' });

describe('pressing Talk', () => {
  it('opens at once, and one quick tap leaves it on', () => {
    const { state, commands } = run([pressTalk(), { type: 'released', source: 'talkButton' }]);
    expect(commands).toEqual(['openMic', 'lowerTutor', 'startTapTimer', 'cancelTimers']);
    expect(state.kind).toBe('free');
  });

  it('treats a press with the microphone on as off, and the release as nothing', () => {
    const { commands } = run([pressTalk(true), { type: 'released', source: 'talkButton' }]);
    expect(commands).toEqual(['closeMic']);
  });

  it('becomes a hold past the tap limit, which tells the tutor, and letting go sends what was said and closes', () => {
    const { commands, state } = run([pressTalk(), { type: 'tapTimeUp' }, { type: 'released', source: 'talkButton' }]);
    expect(commands).toEqual(['openMic', 'lowerTutor', 'startTapTimer', 'tellHoldStarted', 'startLimitTimer', 'endLine', 'cancelTimers']);
    expect(state.kind).toBe('free');
  });

  it('has a tap limit shorter than a spoken word and a hold limit of a minute', () => {
    expect(TAP_LIMIT_MS).toBe(300);
    expect(HOLD_LIMIT_MS).toBe(60_000);
  });
});

describe('holding Space', () => {
  it('leaves nothing on after a quick tap, unlike Talk', () => {
    const { commands, state } = run([pressSpace(), { type: 'released', source: 'space' }]);
    expect(commands).toEqual(['openMic', 'lowerTutor', 'startTapTimer', 'closeMic', 'cancelTimers']);
    expect(state.kind).toBe('free');
  });

  it('does nothing to a microphone already on, because the student turned that on themselves', () => {
    const { commands } = run([pressSpace(true), { type: 'released', source: 'space' }]);
    expect(commands).toEqual([]);
  });

  it('ends the line on release, like Talk', () => {
    const { commands } = run([pressSpace(), { type: 'tapTimeUp' }, { type: 'released', source: 'space' }]);
    expect(commands.at(-2)).toBe('endLine');
  });
});

describe('a hold ended by anything but the finger', () => {
  it('ends the line and closes when focus goes or the tab hides during a hold', () => {
    const { commands, state } = run([pressSpace(), { type: 'tapTimeUp' }, lose()]);
    expect(commands.slice(-2)).toEqual(['endLine', 'cancelTimers']);
    expect(state.kind).toBe('free');
  });

  it('closes when focus goes before it was a hold, because a mic with no finger on it is the worst failure', () => {
    for (const press of [pressSpace(), pressTalk()]) {
      const { commands, state } = run([press, lose()]);
      expect(commands.slice(-2)).toEqual(['closeMic', 'cancelTimers']);
      expect(state.kind).toBe('free');
    }
  });

  it('never reopens on the finger coming up after it, and a new press works', () => {
    const lost = run([pressSpace(), { type: 'tapTimeUp' }, lose()]);
    const { commands, state } = run([{ type: 'released', source: 'space' }], lost.state);
    expect(commands).toEqual([]);
    expect(state.kind).toBe('free');
    expect(run([pressSpace()], state).commands[0]).toBe('openMic');
  });

  it('stops at the limit, says so, and stays closed until a new press', () => {
    const { commands, state } = run([pressSpace(), { type: 'tapTimeUp' }, { type: 'limitReached' }]);
    expect(commands.slice(-3)).toEqual(['endLine', 'cancelTimers', 'showLimitNote']);
    expect(state.kind).toBe('free');
    expect(run([{ type: 'released', source: 'space' }], state).commands).toEqual([]);
  });

  it('still ends the line when the microphone went off another way during a hold, so the agent is not left waiting', () => {
    const { commands, state } = run([pressSpace(), { type: 'tapTimeUp' }, { type: 'micWentOff' }]);
    expect(commands.slice(-2)).toEqual(['endLine', 'cancelTimers']);
    expect(state.kind).toBe('free');
  });

  it('forgets a press that never became a hold when the microphone went off another way', () => {
    const { commands } = run([pressSpace(), { type: 'micWentOff' }]);
    expect(commands.slice(-1)).toEqual(['cancelTimers']);
    expect(commands).not.toContain('endLine');
  });

  it('has nothing to do when nothing is pressed', () => {
    expect(run([lose(), { type: 'limitReached' }, { type: 'tapTimeUp' }, { type: 'micWentOff' }]).commands).toEqual([]);
  });
});

describe('Space and Talk together', () => {
  it('ends a Space hold the moment Talk is pressed, with Space still down', () => {
    const { commands, state } = run([pressSpace(), { type: 'tapTimeUp' }, pressTalk(true)]);
    expect(commands.slice(-2)).toEqual(['endLine', 'cancelTimers']);
    expect(state.kind).toBe('free');
  });

  it('ends a Space hold on a press of Talk, and neither release reopens it', () => {
    const { commands, state } = run([pressSpace(), { type: 'tapTimeUp' }, pressTalk(true), { type: 'released', source: 'talkButton' }, { type: 'released', source: 'space' }]);
    expect(commands.filter((command) => command === 'openMic')).toHaveLength(1);
    expect(commands.filter((command) => command === 'endLine')).toHaveLength(1);
    expect(state.kind).toBe('free');
  });

  it('ignores Space during a Talk hold, and the Talk release still ends it', () => {
    const { commands, state } = run([pressTalk(), { type: 'tapTimeUp' }, pressSpace(true), { type: 'released', source: 'space' }, { type: 'released', source: 'talkButton' }]);
    expect(commands.filter((command) => command === 'endLine')).toHaveLength(1);
    expect(state.kind).toBe('free');
  });

  it('leaves nothing to end when the second finger comes up', () => {
    const { state } = run([pressTalk(), { type: 'tapTimeUp' }, pressSpace(true), { type: 'released', source: 'talkButton' }]);
    expect(state.kind).toBe('free');
    expect(run([{ type: 'released', source: 'space' }], state).commands).toEqual([]);
  });

  it('counts a second press of the same finger as nothing, because key repeat sends it again', () => {
    const { commands } = run([pressSpace(), { type: 'tapTimeUp' }, pressSpace(true), pressSpace(true)]);
    expect(commands.filter((command) => command === 'openMic')).toHaveLength(1);
    expect(commands).not.toContain('closeMic');
  });
});

describe('every order of events', () => {
  const EVENTS: PressEvent[] = [pressTalk(false), pressTalk(true), pressSpace(false), pressSpace(true), { type: 'released', source: 'talkButton' }, { type: 'released', source: 'space' }, { type: 'tapTimeUp' }, { type: 'limitReached' }, { type: 'fingerLost' }, { type: 'micWentOff' }];

  it('never leaves a hold or a press open once every finger is up, in any reachable order up to six events', () => {
    const walk = (state: PressState, isMicOn: boolean, fingers: Set<string>, depth: number) => {
      if (fingers.size === 0 && (state.kind === 'pressing' || state.kind === 'holding')) throw new Error(`open with no finger: ${JSON.stringify(state)}`);
      if (depth === 0) return;
      for (const event of EVENTS) {
        if (event.type === 'pressed' && (event.micIsOn !== isMicOn || fingers.has(event.source))) continue;
        if (event.type === 'released' && !fingers.has(event.source)) continue;
        const step = getNextPress(state, event);
        const nextFingers = new Set(fingers);
        if (event.type === 'pressed') nextFingers.add(event.source);
        if (event.type === 'released') nextFingers.delete(event.source);
        let nextMic = isMicOn;
        for (const command of step.commands) {
          if (command === 'openMic') nextMic = true;
          if (command === 'closeMic' || command === 'endLine') nextMic = false;
        }
        if (event.type === 'micWentOff') nextMic = false;
        walk(step.state, nextMic, nextFingers, depth - 1);
      }
    };
    walk(INITIAL_PRESS, false, new Set(), 6);
  });
});
