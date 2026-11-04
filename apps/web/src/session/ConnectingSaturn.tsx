import { useEffect, useRef, useState } from 'react';
import { RETURN_MS } from '../ui/dots/gatherDots';
import { createGatherPainter, type GatherPainter } from '../ui/dots/gatherPainter';
import { prefersReducedMotion } from '../ui/motion';

// While the tutor connects, the dots of a still grid drift into the Saturn from sign-in. It never holds the voice: whenever the tutor is there, the dots go home and the picture goes.
export function ConnectingSaturn({ isConnecting }: { isConnecting: boolean }) {
  const [hasGone, setHasGone] = useState(!isConnecting);
  const canvas = useRef<HTMLCanvasElement>(null);
  const painter = useRef<GatherPainter | null>(null);
  if (isConnecting && hasGone) setHasGone(false);

  useEffect(() => {
    if (isConnecting || hasGone) return undefined;
    painter.current?.handOver();
    const going = setTimeout(() => setHasGone(true), RETURN_MS);
    return () => clearTimeout(going);
  }, [isConnecting, hasGone]);

  useEffect(() => {
    if (hasGone || !canvas.current) return undefined;
    const created = createGatherPainter({ canvas: canvas.current, isReducedMotion: prefersReducedMotion() });
    painter.current = created;
    return () => {
      created?.stop();
      painter.current = null;
    };
  }, [hasGone]);

  if (hasGone) return null;
  return (
    <div aria-hidden="true" data-testid="connecting-saturn" data-leaving={!isConnecting} className="board-connecting">
      <canvas ref={canvas} className="size-full text-ink" />
    </div>
  );
}
