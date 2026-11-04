import type { BoardState } from '@astra/board';
import type { ElementId } from '@astra/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

function getLatestRowId(board: BoardState): string | null {
  const focused = board.focus?.split('.')[0];
  if (focused && board.elements.has(focused as ElementId)) return focused;
  const elements = [...board.elements.values()];
  for (const { id, content } of elements.reverse()) {
    const hangsOn = 'target' in content ? content.target : content.kind === 'task' && 'on' in content ? content.on : undefined;
    if (hangsOn !== undefined) {
      const root = hangsOn.split('.')[0] as string;
      if (board.elements.has(root as ElementId)) return root;
    }
    if (content.kind === 'writeMath' || content.kind === 'studentLine' || content.kind === 'text' || content.kind === 'diagram' || content.kind === 'plot' || content.kind === 'task') return id;
  }
  return null;
}

interface DotTarget {
  rowId: string | null;
  isWatching: boolean;
}

const AT_REST: DotTarget = { rowId: null, isWatching: false };
const ON_THE_LIVE_LINE: DotTarget = { rowId: 'live', isWatching: true };

// Says where the dot belongs: on what just happened, on the live line, or back over the tutor's words.
export function useDotTarget(board: BoardState, isTutorSpeaking: boolean) {
  const [target, setTarget] = useState<DotTarget>(AT_REST);
  const latest = getLatestRowId(board);
  const [lastSeen, setLastSeen] = useState(latest);
  if (latest !== lastSeen) {
    setLastSeen(latest);
    setTarget({ rowId: latest, isWatching: false });
  }
  const wasSpeaking = useRef(false);
  useEffect(() => {
    if (wasSpeaking.current && !isTutorSpeaking) setTarget(ON_THE_LIVE_LINE);
    wasSpeaking.current = isTutorSpeaking;
  }, [isTutorSpeaking]);
  const watchLiveLine = useCallback(() => setTarget(ON_THE_LIVE_LINE), []);
  const goToRest = useCallback(() => setTarget(AT_REST), []);
  const watchRow = useCallback((rowId: string) => setTarget({ rowId, isWatching: true }), []);
  return { target, watchLiveLine, watchRow, goToRest };
}
