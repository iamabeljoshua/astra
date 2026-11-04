import type { BoardState } from '@astra/board';
import { type ReactNode, useEffect, useState } from 'react';
import { BoardView } from '../lab/BoardView';
import { VOICE_LABELS } from '../strings';
import type { LiveVoice } from './liveVoice';

interface BoardFrame {
  board: BoardState;
  atMs: number;
}

// The board is a pure reading of the clock, so one read per frame is all it needs.
export function LiveBoard({ voice, whileEmpty }: { voice: LiveVoice; whileEmpty: ReactNode }) {
  const [frame, setFrame] = useState<BoardFrame>(() => voice.getBoardNow());
  useEffect(() => {
    let animationFrame = requestAnimationFrame(function draw() {
      animationFrame = requestAnimationFrame(draw);
      setFrame(voice.getBoardNow());
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [voice]);
  if (frame.board.elements.size === 0) return whileEmpty;
  return (
    <section aria-label={VOICE_LABELS.board} className="fades-with-theme flex min-h-75 min-w-0 flex-col border border-line bg-panel">
      <BoardView board={frame.board} atMs={frame.atMs} />
    </section>
  );
}
