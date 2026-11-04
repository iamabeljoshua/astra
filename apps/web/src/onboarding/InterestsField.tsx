import { ONBOARDING_LABELS, STUDENT_INTEREST_LABELS } from '../strings';
import { type StudentInterest, STUDENT_INTERESTS } from './answers';

interface InterestsFieldProps {
  selected: StudentInterest[];
  onChange: (interests: StudentInterest[]) => void;
}

export function InterestsField({ selected, onChange }: InterestsFieldProps) {
  function toggle(interest: StudentInterest) {
    const isSelected = selected.includes(interest);
    onChange(isSelected ? selected.filter((earlier) => earlier !== interest) : [...selected, interest]);
  }

  return (
    <div role="group" aria-label={ONBOARDING_LABELS.intoQuestion} className="flex flex-wrap gap-1.5">
      {STUDENT_INTERESTS.map((interest) => (
        <button
          key={interest}
          type="button"
          aria-pressed={selected.includes(interest)}
          onClick={() => toggle(interest)}
          className="border border-line px-3 py-1.5 font-medium hover:border-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
        >
          {STUDENT_INTEREST_LABELS[interest]}
        </button>
      ))}
    </div>
  );
}
