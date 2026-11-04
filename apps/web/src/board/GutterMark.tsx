import { type BoardElement, getMotionValue } from '@astra/board';

const MARK_PATHS = {
  check: ['M3 15 C6 18 9 22 11.5 26 C15 16 21 8 30 3'],
  cross: ['M5 4 C11 11 18 19 26 27', 'M27 4 C19 11 11 19 4 27'],
} as const;

export function GutterMark({ element, atMs, isReducedMotion }: { element: BoardElement; atMs: number; isReducedMotion: boolean }) {
  const { content } = element;
  if (content.kind !== 'annotate' || (content.mark !== 'check' && content.mark !== 'cross')) return null;
  const paths = MARK_PATHS[content.mark];
  const drawn = isReducedMotion ? 1 : getMotionValue(element.entrance, atMs);
  return (
    <svg data-testid={`mark-${content.mark}`} data-mark={element.id} viewBox="0 0 32 30" width="30" height="30" aria-hidden className="flex-none overflow-visible">
      {paths.map((path, index) => {
        const share = Math.min(1, Math.max(0, drawn * paths.length - index));
        return <path key={path} d={path} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - share} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />;
      })}
    </svg>
  );
}
