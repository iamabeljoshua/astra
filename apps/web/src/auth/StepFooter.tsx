import type { ReactNode } from 'react';
import { ONBOARDING_LABELS } from '../strings';

interface StepFooterProps {
  progress: string;
  onBack?: () => void;
  isBackLocked?: boolean;
  action?: ReactNode;
}

// A locked Back stays in the page, because removing it would drop a keyboard student's place.
export function StepFooter({ progress, onBack, isBackLocked = false, action }: StepFooterProps) {
  return (
    <div className="flex min-h-10.5 items-center justify-between gap-3">
      {onBack ? (
        <button
          type="button"
          aria-disabled={isBackLocked}
          className="font-medium text-ink-2 hover:text-ink aria-disabled:opacity-35"
          onClick={() => {
            if (!isBackLocked) onBack();
          }}
        >
          {ONBOARDING_LABELS.back}
        </button>
      ) : (
        <span />
      )}
      <span className="label text-ink-2">{progress}</span>
      {action ?? <span />}
    </div>
  );
}
