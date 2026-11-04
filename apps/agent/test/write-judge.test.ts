import { describe, expect, it } from 'vitest';
import { createWriteJudge } from '../src/lab/proof/math-page-checks.ts';

const LANDS_AT_MS = 1000;

function makeLab() {
  const clock = { nowMs: 0 };
  const frames: { atMs: number }[] = [];
  return {
    clock,
    frames,
    lab: {
      describeLive: (atMs: number) => ({ elements: [{ id: 'curve', kind: 'plot', drawn: atMs < LANDS_AT_MS ? 0.5 : 1 }] }),
      player: { getNowMs: () => clock.nowMs, getOperations: () => [{ kind: 'command', atMs: 200 }] },
      records: { frames },
    },
  };
}

describe('judging a write to the board', () => {
  it('gives a drawing its last step when the paint finishes long after the frame it belongs to', () => {
    const { lab, clock, frames } = makeLab();
    const writes = createWriteJudge(lab);
    frames.push({ atMs: 960 });
    clock.nowMs = 975;
    expect(writes.hasMovedSinceLastWrite()).toBe(true);
    writes.noteWrite();
    frames.push({ atMs: 1060 });
    clock.nowMs = 1180;
    expect(writes.hasMovedSinceLastWrite()).toBe(true);
  });

  it('finds no cause for a write once the landing has been written', () => {
    const { lab, clock, frames } = makeLab();
    const writes = createWriteJudge(lab);
    frames.push({ atMs: 1060 });
    clock.nowMs = 1080;
    writes.noteWrite();
    frames.push({ atMs: 5000 });
    clock.nowMs = 5010;
    expect(writes.hasMovedSinceLastWrite()).toBe(false);
  });

  it('finds no cause for the first write on a board at rest', () => {
    const { lab, clock } = makeLab();
    clock.nowMs = 5000;
    expect(createWriteJudge(lab).hasMovedSinceLastWrite()).toBe(false);
  });
});
