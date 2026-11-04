import { writeStyle } from '@astra/board/drawing';
import { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from './useReducedMotion';

const PHONE_WIDTH = 860;

/** How much larger the dot grows at the voice's loudest. */
const LARGEST_PULSE = 0.55;

interface DotState {
  /** The board row the dot sits by, or null to rest over the tutor's words. */
  rowId: string | null;
  isWatching: boolean;
  isThinking: boolean;
  isLively: boolean;
  /** How loud the voice is now, from 0 to 1. */
  getLoudness(): number;
}

function getRowSpot(row: Element): { x: number; y: number } {
  const box = row.getBoundingClientRect();
  const x = window.innerWidth <= PHONE_WIDTH ? Math.max(2, box.left - 14) : box.left - 26;
  return { x, y: box.top + Math.min(box.height / 2, 30) - 6.5 };
}

function getRestingSpot(): { x: number; y: number } | null {
  const now = document.querySelector('[data-utterance-now]');
  const caption = now ?? document.querySelector('[data-testid="tutor-caption"]');
  if (!caption) return null;
  const box = caption.getBoundingClientRect();
  return { x: box.left, y: now ? box.top - 22 : box.bottom - 18 };
}

// The tutor's one dot. It sits by whatever is being worked on and rests over the tutor's words. It moves by a transition, so a reduced motion setting makes it simply appear.
export function MovingDot({ rowId, isWatching, isThinking, isLively, getLoudness }: DotState) {
  const dot = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLElement>(null);
  const isReducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    if (!dot.current) return;
    const row = rowId === null ? null : document.querySelector(`[data-row="${rowId}"]`);
    const spot = row ? getRowSpot(row) : getRestingSpot();
    if (spot) writeStyle(dot.current, 'transform', `translate(${Math.round(spot.x)}px, ${Math.round(spot.y)}px)`);
    if (body.current) writeStyle(body.current, 'transform', isReducedMotion ? '' : `scale(${(1 + getLoudness() * LARGEST_PULSE).toFixed(3)})`);
  });

  return (
    <div ref={dot} aria-hidden data-testid="tutor-dot" data-lively={isLively} data-thinking={isThinking} data-watching={isWatching} className="board-moving-dot">
      <i ref={body} />
    </div>
  );
}
