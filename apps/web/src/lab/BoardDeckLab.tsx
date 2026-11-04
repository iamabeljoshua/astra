import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { BoardView } from './BoardView';
import { type BoardDeck, createBoardDeck, type ShownScene } from './deck/deckSweep';

declare global {
  interface Window {
    boardDeck?: BoardDeck;
  }
}

// Development-only page that draws one deck scene at one size and moment, for scripts/check-layout.ts.
export default function BoardDeckLab() {
  const [shown, setShown] = useState<ShownScene | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const listeners = useRef<Pick<ReturnType<typeof createBoardDeck>, 'noteProblem' | 'noteRefusedMath'> | null>(null);

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
        {shown ? <BoardView key={shown.key} board={shown.board} atMs={shown.atMs} canMoveSliders qualityTier={0} onBoardProblem={(problem) => listeners.current?.noteProblem(problem)} onMathRefused={(tex) => listeners.current?.noteRefusedMath(tex)} /> : null}
      </div>
    </main>
  );
}
