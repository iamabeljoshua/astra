import type { RefObject } from 'react';
import { ONBOARDING_LABELS } from '../strings';
import { MAX_INTEREST_LENGTH } from './fieldLimits';

interface InterestsFieldProps {
  picked: string[];
  typed: string;
  onChange: (change: { pickedInterests?: string[]; typedInterest?: string }) => void;
  typedInput?: RefObject<HTMLInputElement | null>;
}

export function InterestsField({ picked, typed, onChange, typedInput }: InterestsFieldProps) {
  function togglePicked(interest: string) {
    const isPicked = picked.includes(interest);
    onChange({ pickedInterests: isPicked ? picked.filter((earlier) => earlier !== interest) : [...picked, interest] });
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {ONBOARDING_LABELS.intoOptions.map((interest) => (
          <button
            key={interest}
            type="button"
            aria-pressed={picked.includes(interest)}
            onClick={() => togglePicked(interest)}
            className="border border-line px-3 py-1.5 font-medium hover:border-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
          >
            {interest}
          </button>
        ))}
      </div>
      <input
        ref={typedInput}
        className="line-input text-sub!"
        maxLength={MAX_INTEREST_LENGTH}
        aria-label={ONBOARDING_LABELS.intoPlaceholder}
        placeholder={ONBOARDING_LABELS.intoPlaceholder}
        value={typed}
        onChange={(event) => onChange({ typedInterest: event.target.value })}
      />
    </>
  );
}
