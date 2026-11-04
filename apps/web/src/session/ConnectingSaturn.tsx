import { useEffect, useRef, useState } from 'react';
import { createGatherPainter, type GatherPainter } from '../ui/dots/gatherPainter';
import { prefersReducedMotion } from '../ui/motion';

// While the tutor connects, the dots of a still grid drift into the Saturn from sign-in. It never holds the voice: whenever the tutor is there, the dots go home and the picture goes.
export function ConnectingSaturn({ isConnecting }: { isConnecting: boolean }) {
  const [isShown, setIsShown] = useState(isConnecting);
  const [isLeaving, setIsLeaving] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const painter = useRef<GatherPainter | null>(null);

  useEffect(() => {
    if (isConnecting) {
      setIsLeaving(false);
      setIsShown(true);
      return;
    }
    if (!painter.current) {
      setIsShown(false);
      return;
    }
    setIsLeaving(true);
    painter.current.handOver();
  }, [isConnecting]);

  useEffect(() => {
    if (!isShown || !canvas.current) return undefined;
    const created = createGatherPainter({ canvas: canvas.current, isReducedMotion: prefersReducedMotion(), onReturned: () => setIsShown(false) });
    painter.current = created;
    return () => {
      created?.stop();
      painter.current = null;
    };
  }, [isShown]);

  if (!isShown) return null;
  return (
    <div aria-hidden="true" data-testid="connecting-saturn" data-leaving={isLeaving} className="board-connecting">
      <canvas ref={canvas} className="size-full text-ink" />
    </div>
  );
}
