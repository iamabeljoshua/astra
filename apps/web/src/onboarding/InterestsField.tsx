import { InterestDrawing } from '../home/interestDrawings';
import { ONBOARDING_LABELS, STUDENT_INTEREST_LABELS } from '../strings';
import { ChipGroup } from '../ui/ChipGroup';
import { type StudentInterest, STUDENT_INTERESTS } from './answers';

interface InterestsFieldProps {
  selected: StudentInterest[];
  onChange: (interests: StudentInterest[]) => void;
}

const INTEREST_CHIPS = STUDENT_INTERESTS.map((interest) => ({
  value: interest,
  label: STUDENT_INTEREST_LABELS[interest],
  picture: <InterestDrawing interest={interest} />,
}));

export function InterestsField({ selected, onChange }: InterestsFieldProps) {
  return <ChipGroup label={ONBOARDING_LABELS.intoQuestion} options={INTEREST_CHIPS} selected={selected} onChange={onChange} />;
}
