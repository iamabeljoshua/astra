import { type Beat, type BeatPlayed, getBeatText, getSpokenWords, parseBeat, parseSessionEvent, type SessionEvent, type SessionEventBody } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { type BoardElement, describeBoard, getFrozenFrames, getSceneFrame } from '../src/player/board-state.ts';
import { rebuildBoard } from '../src/player/rebuild-board.ts';

const WORD_MS = 300;
const shot = { kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.81 } } };
const PEAK_SECONDS = 5.6 / 9.81;

function makeBeat(id: string, script: unknown[]): Beat {
  const parsed = parseBeat({ id, script, expectsReply: false });
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
}

type BeatPlayedBody = BeatPlayed & { atMs: number };

function finished(beat: Beat, atMs: number, firedCueMs: number[] = []): BeatPlayedBody {
  const wordCount = getSpokenWords(getBeatText(beat)).length;
  const wordStartsMs = Array.from({ length: wordCount }, (_, index) => index * WORD_MS);
  return { kind: 'beatPlayed', atMs, turnId: 't' as never, beat, wordStartsMs, durationMs: wordCount * WORD_MS, playedWords: wordCount, firedCueMs, ending: 'finished', frozen: [], reportedBy: 'browser' };
}

function cutFrom(played: BeatPlayedBody, report: Pick<BeatPlayedBody, 'durationMs' | 'playedWords' | 'frozen'>): BeatPlayedBody {
  return { ...played, ...report, ending: 'interrupted' };
}

function parseLog(bodies: (SessionEventBody & { atMs: number })[]): SessionEvent[] {
  return bodies.map((body, seq) => {
    const parsed = parseSessionEvent(JSON.parse(JSON.stringify({ seq, ...body })));
    if (!parsed.ok) throw new Error(parsed.problem);
    return parsed.value;
  });
}

const getIds = (log: SessionEvent[], atMs: number) => describeBoard(rebuildBoard(log, atMs), atMs).elements.map((element) => element.id);
const getSeconds = (log: SessionEvent[], atMs: number) => describeBoard(rebuildBoard(log, atMs), atMs).elements[0]?.sceneSeconds;

describe('rebuildBoard', () => {
  it('replays a cue when it really fired, so a late drawing lands late', () => {
    const beat = makeBeat('b', ['Now ', { kind: 'text', id: 'late', text: 'x' }, 'look here.']);
    const log = parseLog([finished(beat, 1000, [930])]);
    expect(getIds(log, 1929)).toEqual([]);
    expect(getIds(log, 1930)).toEqual(['late']);
  });

  it('never replays a cue that did not fire, even if its word played', () => {
    const beat = makeBeat('b', ['Look at ', { kind: 'text', id: 'never', text: 'x' }, 'this.']);
    const log = parseLog([cutFrom(finished(beat, 0, []), { durationMs: 900, playedWords: 3, frozen: [] })]);
    expect(getIds(log, 5000)).toEqual([]);
  });

  it('flattens by time, because a beat is written when it ends', () => {
    const setup = makeBeat('a', [shot, 'Set up.']);
    const beat = makeBeat('b', ['Now ', { kind: 'runSimulation', target: 'shot', action: 'pause' }, 'stop it.']);
    const drag = { kind: 'studentActed' as const, atMs: 1100, action: { action: 'sliderDragged' as const, target: 'shot' as never, parameter: 'gravity' as const, samples: [{ afterMs: 0, value: 1.6 }] } };
    const log = parseLog([finished(setup, 0, [0]), finished(beat, 1000, [300]), drag]);
    expect(getSeconds(log, 1300)).toBeCloseTo(0.2, 2);
    expect(getSeconds(log, 5000)).toBeCloseTo(0.2, 2);
  });

  it('applies a frozen frame exactly, and a later play carries on from it', () => {
    const setup = makeBeat('a', [shot, { kind: 'runSimulation', target: 'shot', action: 'play' }, 'Watch this arrow.']);
    const cut = cutFrom(finished(setup, 0, [0, 0]), { durationMs: 400, playedWords: 2, frozen: [{ target: 'shot' as never, simulationSeconds: 0.71 }] });
    const resume = makeBeat('b', [{ kind: 'runSimulation', target: 'shot', action: 'play' }, 'It keeps going.']);
    const log = parseLog([cut, finished(resume, 2000, [0])]);
    expect(getSeconds(log, 400)).toBe(0.71);
    expect(getSeconds(log, 1999)).toBe(0.71);
    expect(getSeconds(log, 2100)).toBeCloseTo(0.81, 2);
  });

  it('finishes an entrance cut mid-way when the board unfreezes', () => {
    const beat = makeBeat('a', [{ kind: 'text', id: 'label', text: 'x' }, 'Look at this.']);
    const cut = cutFrom(finished(beat, 0, [0]), { durationMs: 100, playedWords: 1, frozen: [{ target: 'label' as never, drawnFraction: 0.25 }] });
    const next = makeBeat('b', ['Carry on.']);
    const log = parseLog([cut, finished(next, 1000)]);
    const drawnAt = (atMs: number) => describeBoard(rebuildBoard(log, atMs), atMs).elements[0]?.drawn;
    expect(drawnAt(900)).toBe(0.25);
    expect(drawnAt(1000 + 300)).toBe(1);
  });

  it('plays until a named moment, seeks, restarts, and changes a parameter', () => {
    const beat = makeBeat('a', [shot, { kind: 'runSimulation', target: 'shot', action: 'play', until: 'peak' }, 'Up ', { kind: 'runSimulation', target: 'shot', action: 'seek', to: 'landing' }, 'then ', { kind: 'setParameter', target: 'shot', parameter: 'gravity', value: 1.6 }, 'moon.']);
    const log = parseLog([finished(beat, 0, [0, 0, 1000, 2000])]);
    expect(getSeconds(log, 900)).toBeCloseTo(PEAK_SECONDS, 3);
    expect(getSeconds(log, 1500)).toBeGreaterThan(1);
    expect(getSeconds(log, 2500)).toBe(0);
  });

  it('runs a play over words at the speed the word times set', () => {
    const beat = makeBeat('a', [shot, 'Watch ', { kind: 'runSimulation', target: 'shot', action: 'play', until: 1, overWords: 2 }, 'it climb and fall.']);
    const log = parseLog([finished(beat, 0, [0, WORD_MS])]);
    expect(getSeconds(log, WORD_MS + WORD_MS)).toBeCloseTo(0.5, 3);
    expect(getSeconds(log, WORD_MS + 2 * WORD_MS)).toBeCloseTo(1, 3);
  });

  it('builds a reveal in steps and freezes it where the cut landed', () => {
    const setup = makeBeat('a', ['Here ', { kind: 'plot', id: 'graph', expression: 'x', domain: [0, 10], startsEmpty: true }, 'it is.']);
    const beat = makeBeat('b', ['Now ', { kind: 'reveal', target: 'graph', upTo: 10, overWords: 4 }, 'it draws as I say this.']);
    const cut = cutFrom(finished(beat, 1000, [WORD_MS]), { durationMs: 900, playedWords: 3, frozen: [{ target: 'graph' as never, revealedUpTo: 5 }] });
    const log = parseLog([finished(setup, 0, [WORD_MS]), cut]);
    const revealedAt = (atMs: number) => describeBoard(rebuildBoard(log, atMs), atMs).elements[0]?.revealedUpTo;
    expect(revealedAt(1000)).toBe(0);
    expect(revealedAt(1000 + WORD_MS + 600)).toBe(5);
    expect(revealedAt(9000)).toBe(5);
  });

  it('hides, clears, reuses an id in place, and transforms an equation keeping its element', () => {
    const first = makeBeat('a', [{ kind: 'writeMath', id: 'eq', tex: 'x' }, { kind: 'text', id: 'note', text: 'n' }, 'One ', { kind: 'transformMath', target: 'eq', tex: 'y' }, 'two ', { kind: 'hide', target: 'note' }, 'three.']);
    const second = makeBeat('b', [{ kind: 'text', id: 'eq', text: 'now text' }, 'Four ', { kind: 'clearBoard' }, 'five.']);
    const log = parseLog([finished(first, 0, [0, 0, 300, 600]), finished(second, 900, [0, 300])]);
    expect(describeBoard(rebuildBoard(log, 500), 500).elements[0]?.tex).toBe('y');
    expect(getIds(log, 300)).toEqual(['eq', 'note']);
    expect(getIds(log, 600)).toEqual(['eq']);
    expect(describeBoard(rebuildBoard(log, 900), 900).elements[0]?.kind).toBe('text');
    expect(getIds(log, 1200)).toEqual([]);
  });

  it('keeps a student ink stroke, and an erase naming a tutor element leaves it alone', () => {
    const beat = makeBeat('a', [{ kind: 'text', id: 'note', text: 'n' }, 'One.']);
    const log = parseLog([
      finished(beat, 0, [0]),
      { kind: 'studentActed', atMs: 500, action: { action: 'inkStroke', id: 'ink-1' as never, points: [[0.2, 0.2, 0]] } },
      { kind: 'studentActed', atMs: 600, action: { action: 'inkErased', target: 'note' as never } },
      { kind: 'studentActed', atMs: 700, action: { action: 'inkErased', target: 'ink-1' as never } },
    ]);
    expect(getIds(log, 650)).toEqual(['note', 'ink-1']);
    expect(getIds(log, 800)).toEqual(['note']);
  });

  it('goes back to before the rewound beat, and a seek before the rewind still shows what was there', () => {
    const first = makeBeat('one', ['First ', { kind: 'text', id: 'one', text: 'x' }, 'one.']);
    const second = makeBeat('two', ['Then ', { kind: 'text', id: 'two', text: 'y' }, 'two.']);
    const log = parseLog([finished(first, 0, [300]), finished(second, 1000, [300]), { kind: 'studentActed', atMs: 2000, action: { action: 'rewound', turnId: 't' as never, toBeat: 'two' as never } }]);
    expect(getIds(log, 1500)).toEqual(['one', 'two']);
    expect(getIds(log, 2000)).toEqual(['one']);
  });

  describe('a rewind', () => {
    const REWOUND_AT_MS = 6000;
    const BEAT_AT_MS = 1000;
    const longScene = { parts: ['x'], moments: {}, durationSeconds: 100, getFrame: (seconds: number) => ({ seconds }) };
    const catalog = (command: { kind: string }) => (command.kind === 'simulate' ? longScene : null);
    const rewound = { kind: 'studentActed', atMs: REWOUND_AT_MS, action: { action: 'rewound', turnId: 't' as never, toBeat: 'later' as never } } as const;
    const placing = makeBeat('placing', [shot, { kind: 'runSimulation', target: 'shot', action: 'play' }, 'One two']);
    const later = makeBeat('later', [{ kind: 'text', id: 'late', text: 't' }, 'One two']);
    const log = parseLog([{ ...finished(placing, 0, [0, 0]) }, { ...finished(later, BEAT_AT_MS, [0]) }, rewound]);
    const secondsAt = (atMs: number) => (getSceneFrame(rebuildBoard(log, atMs, catalog).elements.get('shot' as never) as BoardElement, atMs) as { seconds: number }).seconds;

    it('lands on the moment of its beat and stays there, wherever the press came', () => {
      expect(secondsAt(BEAT_AT_MS - 1)).toBeCloseTo(0.999, 2);
      expect(secondsAt(REWOUND_AT_MS)).toBeCloseTo(1, 2);
      expect(secondsAt(REWOUND_AT_MS + 4000)).toBeCloseTo(1, 2);
    });

    it('finishes a drawing it caught mid-entrance when the next beat plays, because no later cue would', () => {
      const title = makeBeat('title', [{ kind: 'text', id: 'heading', text: 'h' }, 'One two']);
      const next = makeBeat('next', ['Three four']);
      const entranceLog = parseLog([finished(title, 0, [0]), finished(later, 100, []), { ...rewound, atMs: 3000 }, finished(next, 4000, [])]);
      const drawnAt = (atMs: number) => describeBoard(rebuildBoard(entranceLog, atMs), atMs).elements.find((element) => element.id === 'heading')?.drawn;
      expect(drawnAt(3500)).toBeLessThan(1);
      expect(drawnAt(4500)).toBe(1);
    });
  });

  it('holds everything moving at a cut, not only what the report names', () => {
    const placing = makeBeat('placing', [shot, { kind: 'runSimulation', target: 'shot', action: 'play' }, 'One two']);
    const longScene = { parts: ['x'], moments: {}, durationSeconds: 100, getFrame: (seconds: number) => ({ seconds }) };
    const log = parseLog([cutFrom(finished(placing, 0, [0, 0]), { durationMs: 1000, playedWords: 1, frozen: [] })]);
    const secondsAt = (atMs: number) => (getSceneFrame(rebuildBoard(log, atMs, (command) => (command.kind === 'simulate' ? longScene : null)).elements.get('shot' as never) as BoardElement, atMs) as { seconds: number }).seconds;
    expect(secondsAt(3000)).toBeCloseTo(1, 2);
  });

  it('reports only what is still moving', () => {
    const beat = makeBeat('a', [shot, { kind: 'runSimulation', target: 'shot', action: 'play' }, { kind: 'text', id: 'note', text: 'n' }, 'Watch.']);
    const log = parseLog([finished(beat, 0, [0, 0, 0])]);
    expect(getFrozenFrames(rebuildBoard(log, 200), 200).map((frame) => Object.keys(frame)[1])).toEqual(['drawnFraction', 'simulationSeconds', 'drawnFraction']);
    expect(getFrozenFrames(rebuildBoard(log, 500), 500).map((frame) => frame.target)).toEqual(['shot']);
    expect(getFrozenFrames(rebuildBoard(log, 5000), 5000)).toEqual([]);
  });
});
