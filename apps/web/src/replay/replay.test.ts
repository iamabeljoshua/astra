import { describeBoard, type BoardOperation, getBoardAt, getLogOperations, rebuildBoard } from '@astra/board';
import { checkWorkOnBoard } from '@astra/board/shared';
import type { ElementId, SessionEvent, StudentWork } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { getKeyMoments, getRecapMoment } from './keyMoments';
import { getReplayBoard, getReplayCaption, getReplayStudentLine, getSpokenBeatAt, readReplayLesson } from './replayLesson';

const id = (value: string) => value as ElementId;
const SET_PROBLEM = { kind: 'writeMath', id: id('steps'), tex: '2x+3=11' } as const;
const SET_TASK = { kind: 'task', id: id('a1'), way: 'write', on: id('steps') } as const;

function beatEvent(seq: number, atMs: number, turnId: string, text: string, commands: readonly object[] = [], ending = 'finished', playedWords = text.split(' ').length) {
  return { seq, atMs, kind: 'beatPlayed', turnId, beat: { id: `b${seq}`, script: [...commands, text], expectsReply: false }, reportedBy: 'browser', wordStartsMs: text.split(' ').map((_, index) => index * 100), durationMs: playedWords * 100, playedWords, firedCueMs: commands.map(() => 0), ending, frozen: [] };
}

function buildLog(): { log: SessionEvent[]; operations: BoardOperation[] } {
  const operations: BoardOperation[] = [SET_PROBLEM, SET_TASK].map((command) => ({ kind: 'command', atMs: 100, command, overMs: null }));
  const log: object[] = [beatEvent(0, 100, 'turn-1', 'Look at this line now.', [SET_PROBLEM, SET_TASK])];
  const lines: StudentWork[] = [{ way: 'write', id: id('s1'), text: '2x = 14', task: id('a1') }, { way: 'write', id: id('s2'), text: '2x = 8', task: id('a1') }, { way: 'write', id: id('s3'), text: 'x = 4', task: id('a1') }];
  lines.forEach((work, index) => {
    const atMs = 1000 * (index + 1);
    const action = { action: 'worked', work, ...checkWorkOnBoard(work, getBoardAt(operations, atMs)) } as const;
    operations.push({ kind: 'worked', atMs, action });
    log.push({ seq: log.length, atMs, kind: 'studentActed', action });
  });
  log.push(beatEvent(log.length, 3500, 'turn-2', 'That line works.'));
  log.push({ seq: log.length, atMs: 4200, kind: 'studentSpoke', text: 'why did that work', source: 'typed', isReaction: false, durationMs: 0 });
  return { log: log as SessionEvent[], operations };
}

describe('a replay read from a saved log', () => {
  const { log, operations } = buildLog();
  const lesson = readReplayLesson([{ events: JSON.parse(JSON.stringify(log)) as unknown[] }]);

  it('rebuilds the same board as the live board at any seek point, in any order', () => {
    const points = [0, 50, 150, 1000, 1100, 2100, 3000, 3300, 4400, 2500, 700, 4400];
    for (const atMs of points) {
      const { board, atMs: boardAtMs } = getReplayBoard(lesson, atMs);
      expect(describeBoard(board, boardAtMs)).toEqual(describeBoard(getBoardAt(operations, atMs), atMs));
      expect(describeBoard(board, boardAtMs)).toEqual(describeBoard(rebuildBoard(log, atMs), atMs));
    }
  });

  it('holds the last moment for a beat, so a replay does not stop on the last word', () => {
    expect(lesson.durationMs).toBeGreaterThan(4200);
  });

  it('follows the words as they played, with those to come holding their place', () => {
    expect(getReplayCaption(lesson, 50)).toMatchObject({ heard: [], coming: [], isSpeaking: false });
    expect(getReplayCaption(lesson, 320)).toMatchObject({ heard: ['Look', 'at', 'this'], coming: ['line', 'now.'], isSpeaking: true });
    expect(getReplayCaption(lesson, 2000)).toMatchObject({ heard: ['Look', 'at', 'this', 'line', 'now.'], coming: [], isSpeaking: false });
  });

  it('moves an earlier turn up, and takes it away again on a seek back', () => {
    expect(getReplayCaption(lesson, 3650)).toMatchObject({ past: ['Look at this line now.'], heard: ['That', 'line'] });
    expect(getReplayCaption(lesson, 320).past).toEqual([]);
  });

  it('never shows a word a cut beat did not play', () => {
    const cut = readReplayLesson([{ events: [beatEvent(0, 0, 't', 'one two three four five', [], 'interrupted', 2)] }]);
    expect(getReplayCaption(cut, 5000).heard).toEqual(['one', 'two']);
  });

  it('shows the student\'s last line from when they said it, and not before', () => {
    expect(getReplayStudentLine(lesson, 4100)).toBeNull();
    expect(getReplayStudentLine(lesson, 4300)).toBe('why did that work');
  });

  it('says which word of which beat is being spoken, for the device\'s voice', () => {
    expect(getSpokenBeatAt(lesson, 320)).toMatchObject({ word: 2, beat: { atMs: 100 } });
    expect(getSpokenBeatAt(lesson, 2000)).toBeNull();
  });

  it('leaves out a row the parser refuses, and keeps the lesson', () => {
    const withBad = readReplayLesson([{ events: [...JSON.parse(JSON.stringify(log)) as object[], { seq: 99, atMs: 1, kind: 'madeUp' }] }]);
    expect(describeBoard(getReplayBoard(withBad, 3000).board, 3000)).toEqual(describeBoard(getReplayBoard(lesson, 3000).board, 3000));
  });
});

describe('a session the student came back to', () => {
  const first = [beatEvent(0, 100, 't1', 'First tutor here.', [SET_PROBLEM])];
  const second = [beatEvent(0, 200, 't1', 'Second tutor here.')];
  const lesson = readReplayLesson([{ events: first }, { events: second }]);

  it('plays one run after another, skipping the time between them', () => {
    const firstEnd = lesson.runs[0]?.endsAtMs as number;
    expect(lesson.runs[1]?.startsAtMs).toBe(firstEnd);
    expect(getReplayCaption(lesson, firstEnd + 250).heard).toEqual(['Second']);
  });

  it('starts each run on the clear board that tutor started on', () => {
    expect(getReplayBoard(lesson, 300).board.elements.has(id('steps'))).toBe(true);
    expect(getReplayBoard(lesson, (lesson.runs[1]?.startsAtMs as number) + 500).board.elements.has(id('steps'))).toBe(false);
  });

  it('takes a turn with the same name in another run as its own', () => {
    const atMs = (lesson.runs[1]?.startsAtMs as number) + 500;
    expect(getSpokenBeatAt(lesson, atMs)?.beat.key).not.toBe(getSpokenBeatAt(lesson, 200)?.beat.key);
  });
});

describe('the key moments', () => {
  const { log } = buildLog();
  const operations = getLogOperations(log);

  it('are the work code called right, and otherwise what the tutor drew', () => {
    expect(getKeyMoments(operations)).toEqual([2600, 3600]);
    expect(getKeyMoments(operations.filter((operation) => operation.kind === 'command'))).toEqual([700, 700]);
    expect(getKeyMoments([])).toEqual([]);
  });

  it('are shown in turn as the recap plays, and then the board as it stands', () => {
    expect(getRecapMoment([10, 20, 30], 0)).toBe(10);
    expect(getRecapMoment([10, 20, 30], 0.5)).toBe(20);
    expect(getRecapMoment([10, 20, 30], 1)).toBeNull();
    expect(getRecapMoment([], 0)).toBeNull();
  });
});
