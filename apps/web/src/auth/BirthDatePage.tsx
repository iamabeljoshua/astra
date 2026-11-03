import { type FormEvent, type RefObject, useRef, useState } from 'react';
import { API_ERROR_LABELS, BIRTH_DATE_LABELS } from '../strings';
import { OnboardingFrame } from './OnboardingFrame';
import { SignOutButton } from './SignOutButton';
import { StepHeading } from './StepHeading';
import { toLatinDigits } from './toLatinDigits';
import { useAnswerBirthDate } from './useAccount';

const DAY_OR_MONTH = /^\d{1,2}$/;
const YEAR = /^\d{4}$/;
const FORM_ID = 'birth-date';
const QUESTION_ID = 'birth-date-question';
const PROBLEM_ID = 'birth-date-problem';

interface DateParts {
  day: string;
  month: string;
  year: string;
}

const EMPTY_DATE: DateParts = { day: '', month: '', year: '' };

const DATE_FIELDS = [
  { part: 'day', label: BIRTH_DATE_LABELS.day, placeholder: BIRTH_DATE_LABELS.dayPlaceholder, maxLength: 2, width: 'w-[72px]', autoComplete: 'bday-day' },
  { part: 'month', label: BIRTH_DATE_LABELS.month, placeholder: BIRTH_DATE_LABELS.monthPlaceholder, maxLength: 2, width: 'w-[72px]', autoComplete: 'bday-month' },
  { part: 'year', label: BIRTH_DATE_LABELS.year, placeholder: BIRTH_DATE_LABELS.yearPlaceholder, maxLength: 4, width: 'w-[104px]', autoComplete: 'bday-year' },
] as const;

function toBirthDate(dateParts: DateParts) {
  const [day, month, year] = [dateParts.day, dateParts.month, dateParts.year].map((part) => toLatinDigits(part.trim())) as [string, string, string];
  const isComplete = DAY_OR_MONTH.test(day) && DAY_OR_MONTH.test(month) && YEAR.test(year);
  return isComplete ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : null;
}

export function BirthDatePage() {
  const answerBirthDate = useAnswerBirthDate();
  const [dateParts, setDateParts] = useState(EMPTY_DATE);
  const [isIncomplete, setIsIncomplete] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (answerBirthDate.isPending) return;
    const birthDate = toBirthDate(dateParts);
    setIsIncomplete(!birthDate);
    if (birthDate) answerBirthDate.mutate(birthDate);
  }

  function changePart(part: keyof DateParts, value: string) {
    setDateParts({ ...dateParts, [part]: value });
    setIsIncomplete(false);
    answerBirthDate.reset();
  }

  const { error } = answerBirthDate;
  const isDateRejected = isIncomplete || error?.kind === 'validation';
  const problem = isDateRejected ? BIRTH_DATE_LABELS.rejected : error && API_ERROR_LABELS[error.kind];

  return (
    <OnboardingFrame
      footer={
        <>
          <SignOutButton className="font-medium text-ink-2 hover:text-ink" />
          <button type="submit" form={FORM_ID} aria-disabled={answerBirthDate.isPending} className="button button-solid">
            {BIRTH_DATE_LABELS.next}
          </button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4.5">
        <StepHeading id={QUESTION_ID} fieldToFocus={firstField}>{BIRTH_DATE_LABELS.question}</StepHeading>
        <p className="max-w-[46ch] text-sub text-ink-2">{BIRTH_DATE_LABELS.about}</p>
        <div role="group" aria-labelledby={QUESTION_ID} className="flex flex-wrap gap-3.5">
          {DATE_FIELDS.map((field, index) => (
            <DatePart
              key={field.part}
              field={field}
              value={dateParts[field.part]}
              isInvalid={isDateRejected}
              inputRef={index === 0 ? firstField : undefined}
              onChange={(value) => changePart(field.part, value)}
            />
          ))}
        </div>
        {problem && <p id={PROBLEM_ID} role="alert" className="stop-note">{problem}</p>}
      </form>
    </OnboardingFrame>
  );
}

interface DatePartProps {
  field: (typeof DATE_FIELDS)[number];
  value: string;
  isInvalid: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
}

function DatePart({ field, value, isInvalid, inputRef, onChange }: DatePartProps) {
  return (
    <label className="label flex flex-col gap-0.75 text-ink-2">
      {field.label}
      <input
        ref={inputRef}
        className={`line-input ${field.width} text-ink`}
        inputMode="numeric"
        maxLength={field.maxLength}
        autoComplete={field.autoComplete}
        placeholder={field.placeholder}
        aria-invalid={isInvalid}
        aria-describedby={isInvalid ? PROBLEM_ID : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
