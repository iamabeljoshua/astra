import { describe, expect, it } from 'vitest';
import {
  type BeatPlayed,
  type BoardKinds,
  getBeatText,
  getBoardAfter,
  getBoardProblem,
  getCues,
  getPlayedCues,
  getSpokenWords,
  parseSessionEvent,
  type SessionEvent,
} from '../src/index.ts';
import { SAMPLE_SESSION_EVENTS } from './sample-session.ts';

const EVENTS = SAMPLE_SESSION_EVENTS.map((event) => {
  const parsed = parseSessionEvent(event);
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
});

function findBeatPlayed(beatId: string): BeatPlayed & SessionEvent {
  const found = EVENTS.find((event) => event.kind === 'beatPlayed' && event.beat.id === beatId);
  if (found?.kind !== 'beatPlayed') throw new Error(`no beat ${beatId}`);
  return found;
}

describe('fixture checks: the sample session from PRD section 6.4', () => {
  it('parses every event, unchanged, with only the new types', () => {
    expect(EVENTS).toEqual(SAMPLE_SESSION_EVENTS);
  });

  it('never refers to an element before it exists, or to the wrong kind', () => {
    let board: BoardKinds = new Map();
    for (const event of EVENTS) {
      if (event.kind !== 'beatPlayed') continue;
      for (const { command } of getCues(event.beat)) {
        expect(getBoardProblem(command, board), command.kind).toBeNull();
        board = getBoardAfter(command, board);
      }
    }
  });

  it('gives every beat one word time per spoken word', () => {
    for (const event of EVENTS) {
      if (event.kind !== 'beatPlayed') continue;
      expect(event.wordStartsMs).toHaveLength(getSpokenWords(getBeatText(event.beat)).length);
    }
  });

  it('fires every cue of every beat, so what played is what was written', () => {
    for (const event of EVENTS) {
      if (event.kind !== 'beatPlayed') continue;
      expect(getPlayedCues(event.beat, event.firedCueMs.length), event.beat.id).toEqual(getCues(event.beat));
    }
  });

  it('fires each cue as its word starts, because every report here is on time', () => {
    for (const event of EVENTS) {
      if (event.kind !== 'beatPlayed') continue;
      expect(event.firedCueMs, event.beat.id).toEqual(getCues(event.beat).map((cue) => event.wordStartsMs[cue.atWord]));
    }
  });

  it('draws the hoop and the ball while the tutor sets up the question', () => {
    expect(getCues(findBeatPlayed('b1').beat).map((cue) => cue.command.kind)).toEqual(['drawing', 'simulate']);
  });

  it("shows a turn's first drawing within a second of its first word (B2)", () => {
    const turns = new Map<string, number>();
    const firstDrawings = new Map<string, number>();
    for (const event of EVENTS) {
      if (event.kind !== 'beatPlayed') continue;
      if (!turns.has(event.turnId)) turns.set(event.turnId, event.atMs);
      const firstFiredMs = event.firedCueMs[0];
      if (firstFiredMs !== undefined && !firstDrawings.has(event.turnId)) firstDrawings.set(event.turnId, event.atMs + firstFiredMs);
    }
    expect(turns.size).toBe(5);
    for (const [turnId, startedAtMs] of turns) expect((firstDrawings.get(turnId) ?? Infinity) - startedAtMs, turnId).toBeLessThanOrEqual(1000);
  });

  it('shows the arrow on "hand" and fades it on "lets"', () => {
    const { beat } = findBeatPlayed('b3');
    const words = getSpokenWords(getBeatText(beat));
    const cues = getCues(beat);
    expect(words[cues[0]?.atWord ?? -1]).toBe('hand,');
    expect(cues[0]?.command.kind).toBe('vector');
    expect(words[cues[1]?.atWord ?? -1]).toBe('lets');
    expect(cues[1]?.command.kind).toBe('hide');
  });

  it('records six seconds of silence with no tutor speech in it', () => {
    const question = findBeatPlayed('b4');
    const silenceEnd = EVENTS.find((event) => event.seq === question.seq + 1);
    expect(silenceEnd?.kind).toBe('studentSpoke');
    expect((silenceEnd?.atMs ?? 0) - (question.atMs + question.durationMs)).toBe(6000);
    expect(question.beat.expectsReply).toBe(true);
  });

  it('times the ball to land as the three words of "Watch this arrow." pass', () => {
    const { beat } = findBeatPlayed('b6');
    expect(getSpokenWords(getBeatText(beat))).toHaveLength(3);
    expect(getCues(beat)[0]).toEqual({ atWord: 0, command: { kind: 'runSimulation', target: 'shot', action: 'play', until: 'landing', overWords: 3 } });
  });

  it('records the interruption with the ball frozen on its frame', () => {
    const interrupted = findBeatPlayed('b6');
    expect(interrupted.ending).toBe('interrupted');
    expect(interrupted.frozen).toEqual([{ target: 'shot', simulationSeconds: 1.14 }]);
    const student = EVENTS.find((event) => event.kind === 'studentSpoke' && event.text.startsWith('Wait'));
    const lastWordStart = interrupted.atMs + (interrupted.wordStartsMs.at(-1) ?? 0);
    const cutAt = interrupted.atMs + interrupted.durationMs;
    expect(cutAt - (student?.atMs ?? 0)).toBe(680);
    expect(cutAt).toBeGreaterThan(lastWordStart);
    expect(cutAt - lastWordStart).toBeLessThan(300);
  });

  it('hands the slider over with a ghost path, and records the drag', () => {
    expect(getCues(findBeatPlayed('b8').beat).map((cue) => cue.command.kind)).toEqual(['slider']);
    expect(getCues(findBeatPlayed('b9').beat).map((cue) => cue.command.kind)).toEqual(['ghostPath']);
    const drag = EVENTS.find((event) => event.kind === 'studentActed');
    const samples = drag?.kind === 'studentActed' && drag.action.action === 'sliderDragged' ? drag.action.samples : [];
    expect(samples.at(0)?.value).toBe(4.2);
    expect(samples.at(-1)?.value).toBe(8.4);
  });
});
