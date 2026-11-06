import { type Beat, getCues, type SceneCommand } from '@astra/contracts';
import { getBoardAt } from '@astra/board';
import { describe, expect, it } from 'vitest';
import { makeFakeTutorModel, type FakeReply } from '../src/providers/fake-model.ts';
import { createTutorBrain, type TurnSummary } from '../src/tutor/brain.ts';
import { TUTOR_PROMPT } from '../src/tutor/prompt.ts';

const QUICK = { firstTextMs: 120, betweenTextMs: 80, finishGraceMs: 20, reportWaitMs: 30 };
const NO_TURN_NOTE = { ...TUTOR_PROMPT, turnNote: null, levelLines: {} };

async function sketchReply(pieces: string[]) {
  const summaries: TurnSummary[] = [];
  const model = makeFakeTutorModel((): FakeReply => ({ pieces }));
  const brain = createTutorBrain({ model, timeouts: QUICK, prompt: NO_TURN_NOTE, onTurnEnd: (summary) => summaries.push(summary) });
  const beats: Beat[] = [];
  for await (const beat of brain.reply({ text: 'a ball rolling off a table' }, new AbortController().signal)) beats.push(beat);
  return { commands: beats.flatMap((beat) => getCues(beat).map((cue) => cue.command)), refused: summaries.at(-1)?.refused ?? [], model };
}

const TABLE_AND_BALL = [
  'Picture a table. ',
  '{"kind":"sketch","id":"desk"}',
  '{"kind":"drawShape","id":"floor","target":"desk","shape":"ground"}',
  '{"kind":"drawShape","id":"table","target":"desk","shape":"table","on":"floor","side":"left"}',
  'A table with a ',
  '{"kind":"drawShape","id":"ball","target":"desk","shape":"ball","size":"small","on":"table","side":"left"}',
  'ball on it. It rolls ',
  '{"kind":"animate","target":"ball","motion":"rollOff","overWords":5}',
  'off the edge and curves down to the floor.',
];

describe('the tutor sketching in one reply', () => {
  it('keeps every piece and the motion, because each leans only on pieces drawn before it', async () => {
    const { commands, refused } = await sketchReply(TABLE_AND_BALL);
    expect(refused).toEqual([]);
    expect(commands.map((command) => command.kind)).toEqual(['sketch', 'drawShape', 'drawShape', 'drawShape', 'animate']);
  });

  it('lands the ball on the floor past the table on the board those commands build', async () => {
    const { commands } = await sketchReply(TABLE_AND_BALL);
    const board = getBoardAt(commands.map((command: SceneCommand, index) => ({ kind: 'command', atMs: index * 400, command, overMs: null })), 60_000);
    const table = board.elements.get('table' as never)?.piece?.box;
    const ball = board.elements.get('ball' as never);
    const seconds = ball?.placedScene?.playhead.to ?? 0;
    const landed = ball?.placedScene?.scene.getFrame(seconds) as { at: { x: number; y: number } };
    expect(table && landed.at.x).toBeGreaterThan((table?.x ?? 0) + (table?.width ?? 0) / 2);
    expect(landed.at.y + (ball?.piece?.box.height ?? 0) / 2).toBeCloseTo(7.4, 6);
  });

  it('refuses a motion on a piece never drawn, and says why', async () => {
    const { commands, refused } = await sketchReply(['Watch. ', '{"kind":"animate","motion":"rollOff","target":"ball","overWords":8}', 'It keeps going until the table ends.']);
    expect(commands).toEqual([]);
    expect(refused).toEqual(['animate names ball, which is not on the board']);
  });
});

const boardOf = (commands: readonly SceneCommand[]) => getBoardAt(commands.map((command, index) => ({ kind: 'command', atMs: index * 400, command, overMs: null })), 60_000);
const bottomOf = (box: { y: number; height: number } | undefined) => (box ? box.y + box.height / 2 : Number.NaN);
const FLOOR_Y = 7.4;

describe('the forms the tutor wrote in a real lesson', () => {
  const ON_A_FLOOR_NEVER_DRAWN = [
    'It rolls along, ',
    '{"kind":"sketch","id":"edge"}',
    '{"kind":"drawShape","id":"tbl","target":"edge","shape":"table","on":"floor"}',
    'and the table ',
    '{"kind":"drawShape","id":"b2","target":"edge","shape":"ball","size":"small","on":"tbl","side":"left"}',
    'keeps holding it up ',
    '{"kind":"animate","target":"b2","motion":"rollOff","overWords":8}',
    'until the very last bit, and then it drops.',
  ];

  it('stands a table on the floor when the floor was never drawn, and rolls the ball off it', async () => {
    const { commands, refused } = await sketchReply(ON_A_FLOOR_NEVER_DRAWN);
    expect(refused).toEqual([]);
    expect(commands.map((command) => command.kind)).toEqual(['sketch', 'drawShape', 'drawShape', 'animate']);
    const board = boardOf(commands);
    const table = board.elements.get('tbl' as never)?.piece?.box;
    const ball = board.elements.get('b2' as never);
    const landed = ball?.placedScene?.scene.getFrame(ball.placedScene.playhead.to) as { at: { x: number; y: number } };
    expect(bottomOf(table)).toBeCloseTo(FLOOR_Y, 6);
    expect(landed.at.x).toBeGreaterThan((table?.x ?? 0) + (table?.width ?? 0) / 2);
    expect(landed.at.y + (ball?.piece?.box.height ?? 0) / 2).toBeCloseTo(FLOOR_Y, 6);
  });

  it('starts the sketch that pieces name when it is not on the board yet, as at 91.2 s', async () => {
    const { commands, refused } = await sketchReply([
      '{"id":"fl","kind":"drawShape","shape":"ground","target":"edge"}',
      '{"id":"tb","on":"fl","kind":"drawShape","shape":"table","target":"edge"}',
      '{"id":"bl","on":"tb","kind":"drawShape","side":"left","size":"small","shape":"ball","target":"edge"}',
      'With the ball near one end.',
    ]);
    expect(refused).toEqual([]);
    expect(commands).toEqual([
      { kind: 'sketch', id: 'edge' },
      { id: 'fl', kind: 'drawShape', shape: 'ground', target: 'edge' },
      { id: 'tb', on: 'fl', kind: 'drawShape', shape: 'table', target: 'edge' },
      { id: 'bl', on: 'tb', kind: 'drawShape', side: 'left', size: 'small', shape: 'ball', target: 'edge' },
    ]);
    expect(bottomOf(boardOf(commands).elements.get('bl' as never)?.piece?.box)).toBeLessThan(FLOOR_Y);
  });

  it('never tells the next reply of a sketch with nothing drawn in it', async () => {
    const summaries: TurnSummary[] = [];
    const model = makeFakeTutorModel((_request, attempt): FakeReply => ({ pieces: attempt === 1 ? ['Picture it. ', '{"kind":"sketch","id":"edge"}', '{"kind":"drawShape","id":"cup","target":"edge","shape":"cup"}', 'A cup on a table.'] : ['Okay.'] }));
    const brain = createTutorBrain({ model, timeouts: QUICK, prompt: NO_TURN_NOTE, onTurnEnd: (summary) => summaries.push(summary) });
    const beats: Beat[] = [];
    for (const text of ['a cup on a table', 'go on']) for await (const beat of brain.reply({ text }, new AbortController().signal)) beats.push(beat);
    const notes = (model.requests[1]?.turns ?? []).flatMap((turn) => (turn.role === 'system' ? [JSON.parse(turn.text) as Record<string, unknown>] : []));
    expect(summaries[0]?.refused).toHaveLength(1);
    expect(notes.some((note) => note.refused !== undefined)).toBe(true);
    expect(notes.flatMap((note) => Object.keys((note.board as object | undefined) ?? {}))).not.toContain('edge');
  });
});
