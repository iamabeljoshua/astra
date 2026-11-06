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

  it('refuses a piece that leans on one never drawn, and says why', async () => {
    const { commands, refused } = await sketchReply(['Picture it. ', '{"kind":"sketch","id":"desk"}', '{"kind":"drawShape","id":"ball","target":"desk","shape":"ball","on":"table"}', 'A ball on a table.']);
    expect(commands.map((command) => command.kind)).toEqual(['sketch']);
    expect(refused.join(' ')).toContain('table, which is not a piece of a sketch on the board');
  });
});
