import type { BoardState } from '@astra/board';
import { getOpenTaskOnBoard } from '@astra/board/shared';
import type { StudentWork } from '@astra/contracts';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import type { BoardProblem } from '../board/boardPainting';
import { TypedLine } from '../board/TypedLine';
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
  const [activity, setActivity] = useState(0);
  useEffect(() => {
    let animationFrame = requestAnimationFrame(function draw() {
      animationFrame = requestAnimationFrame(draw);
      setFrame(voice.getBoardNow());
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [voice]);
  const reportProblem = useCallback(
    (problem: BoardProblem) => {
      if (problem.kind === 'markWithoutTarget') voice.reportMarkNotDrawn(problem.markId);
    },
    [voice],
  );
  const getBoard = useCallback(() => voice.getBoardNow().board, [voice]);
  const sendWork = useCallback(
    (work: StudentWork) => {
      voice.sendWork(work);
      setActivity((count) => count + 1);
      setFrame(voice.getBoardNow());
    },
    [voice],
  );
  const sendPause = useCallback((seconds: number, draft?: string) => voice.sendPause(seconds, draft), [voice]);
  if (frame.board.elements.size === 0) return whileEmpty;
  return (
    <section aria-label={VOICE_LABELS.board} className="fades-with-theme flex min-h-75 min-w-0 flex-col border border-line bg-panel">
      <div className="board-shared min-h-0 flex-1">
        <BoardView board={frame.board} atMs={frame.atMs} onBoardProblem={reportProblem} onWork={sendWork} />
      </div>
      <TypedLine task={getOpenTaskOnBoard(frame.board)} getBoard={getBoard} onWork={sendWork} onPause={sendPause} activity={activity} />
    </section>
  );
}
