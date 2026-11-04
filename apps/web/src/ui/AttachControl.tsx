import { ATTACH_LABELS } from '../strings';
import type { FilesComingSoon } from './useFilesComingSoon';

interface AttachControlProps {
  filesComingSoon: FilesComingSoon;
  className: string;
  isLabelShown?: boolean;
}

// Uploads come after the MVP, so every way of adding a file ends at this note, and no file is read.
export function AttachControl({ filesComingSoon: { noteKey, showNote }, className, isLabelShown = false }: AttachControlProps) {
  return (
    <span className="relative inline-flex flex-none">
      <button type="button" aria-label={ATTACH_LABELS.attach} onClick={showNote} className={className}>
        <AttachIcon />
        {isLabelShown && <span>{ATTACH_LABELS.attach}</span>}
      </button>
      <span role="status" className="pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 w-max">
        {noteKey !== null && (
          <span key={noteKey} className="block border border-line bg-panel px-2.5 py-1.25 text-fine text-ink">
            {ATTACH_LABELS.comingSoon}
          </span>
        )}
      </span>
    </span>
  );
}

function AttachIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden className="size-4.5 flex-none">
      <path d="M20 11.5 12.2 19.3a4.6 4.6 0 0 1-6.5-6.5l8-8a3 3 0 0 1 4.3 4.3l-8 8a1.5 1.5 0 0 1-2.1-2.1l7.3-7.3" />
    </svg>
  );
}
