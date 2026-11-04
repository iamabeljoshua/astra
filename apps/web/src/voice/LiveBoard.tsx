import type { BoardState } from '@astra/board';
import { useEffect, useState } from 'react';
import { BoardView } from '../lab/BoardView';
import type { LiveVoice } from './liveVoice';

interface BoardFrame {
  board: BoardState;
  atMs: number;
}

// The board is a pure reading of the clock, so one read per frame is all it needs.
export function LiveBoard({ voice }: { voice: LiveVoice }) {
  const [frame, setFrame] = useState<BoardFrame>(() => voice.getBoardNow());
  useEffect(() => {
    let animationFrame = requestAnimationFrame(function draw() {
      animationFrame = requestAnimationFrame(draw);
      setFrame(voice.getBoardNow());
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [voice]);
  return <BoardView board={frame.board} atMs={frame.atMs} onElementDrawn={(id) => voice.noteDrawn(id)} />;
}
