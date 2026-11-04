import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { BoardStageView } from '../board/BoardStageView';
import type { BoardProblem } from '../board/boardPainting';
import { SharedBoard } from '../board/SharedBoard';
import { BoardView } from './BoardView';
import { type BoardDeck, createBoardDeck, type ShownScene } from './deck/deckSweep';

declare global {
  interface Window {
    boardDeck?: BoardDeck;
  }
}

// The session's own grid, so a row gets the column, the gutter, and the type a student's board gives it at this screen size.
function StudentBoard({ shown, onBoardProblem }: { shown: ShownScene; onBoardProblem(problem: BoardProblem): void }) {
  return (
    <div className="board-session flex flex-col">
      <div className="board-stage">
        <div className="board-voice" />
        <BoardStageView stage={shown.board.stage} atMs={shown.atMs} visual={null} ariaLabel="" peek={null} onPeek={() => {}} footer={null}>
          <SharedBoard board={shown.board} atMs={shown.atMs} onBoardProblem={onBoardProblem} />
        </BoardStageView>
      </div>
    </div>
  );
}

// Development-only page that draws one deck scene at one size and moment, for scripts/check-layout.ts. `?surface=view` draws through the lab's BoardView, and otherwise it is the student's rows.
export default function BoardDeckLab() {
  const [shown, setShown] = useState<ShownScene | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const isView = new URLSearchParams(window.location.search).get('surface') === 'view';
  const listeners = useRef<Pick<ReturnType<typeof createBoardDeck>, 'noteProblem' | 'noteRefusedMath' | 'noteTier'> | null>(null);

  useEffect(() => {
    const { deck, ...noted } = createBoardDeck({
      present: (next) => flushSync(() => setShown(next)),
      getBoardElement: () => stage.current?.querySelector<HTMLElement>('[data-testid="board"]') as HTMLElement,
    });
    listeners.current = noted;
    window.boardDeck = deck;
  }, []);

  return (
    <main className="min-h-svh bg-paper">
      <div ref={stage} data-testid="deck-stage" style={shown ? { width: shown.size.width, height: shown.size.height } : undefined}>
        {shown && isView ? <BoardView key={shown.key} board={shown.board} atMs={shown.atMs} canMoveSliders qualityTier={shown.tier ?? undefined} onQualityTier={(tier) => listeners.current?.noteTier(tier)} onBoardProblem={(problem) => listeners.current?.noteProblem(problem)} onMathRefused={(tex) => listeners.current?.noteRefusedMath(tex)} /> : null}
        {shown && !isView ? <StudentBoard key={shown.key} shown={shown} onBoardProblem={(problem) => listeners.current?.noteProblem(problem)} /> : null}
      </div>
    </main>
  );
}
