import { type ChangeEvent, type FormEvent, type RefObject, useRef, useState } from 'react';
import { API_ERROR_LABELS, BIRTH_DATE_LABELS } from '../strings';
import { OnboardingFrame } from './OnboardingFrame';
import { SignOutButton } from './SignOutButton';
import { useAnswerBirthDate } from './useAccount';
import { useFocusOnWideScreen } from './useFocusOnWideScreen';

const DAY_OR_MONTH = /^\d{1,2}$/;
const YEAR = /^\d{4}$/;
const FORM_ID = 'birth-date';

function toBirthDate(day: string, month: string, year: string) {
  const isComplete = DAY_OR_MONTH.test(day) && DAY_OR_MONTH.test(month) && YEAR.test(year);
  return isComplete ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : null;
}

export function BirthDatePage() {
  const answerBirthDate = useAnswerBirthDate();
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [isIncomplete, setIsIncomplete] = useState(false);
  const dayInput = useRef<HTMLInputElement>(null);
  useFocusOnWideScreen(dayInput);

  function submit(event: FormEvent) {
    event.preventDefault();
    const birthDate = toBirthDate(day.trim(), month.trim(), year.trim());
    setIsIncomplete(!birthDate);
    if (birthDate) answerBirthDate.mutate(birthDate);
  }

  const { error } = answerBirthDate;
  const isDateRejected = isIncomplete || error?.kind === 'validation';

  return (
    <OnboardingFrame
      footer={
        <>
          <SignOutButton className="font-medium text-ink-2 hover:text-ink" />
          <button type="submit" form={FORM_ID} disabled={answerBirthDate.isPending} className="button button-solid">
            {BIRTH_DATE_LABELS.next}
          </button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4.5">
        <h1 className="text-question font-semibold text-balance">{BIRTH_DATE_LABELS.question}</h1>
        <p className="max-w-[46ch] text-sub text-ink-2">{BIRTH_DATE_LABELS.about}</p>
        <div className="flex flex-wrap gap-3.5">
          <DatePart
            label={BIRTH_DATE_LABELS.day}
            placeholder={BIRTH_DATE_LABELS.dayPlaceholder}
            maxLength={2}
            autoComplete="bday-day"
            value={day}
            onChange={setDay}
            inputRef={dayInput}
          />
          <DatePart
            label={BIRTH_DATE_LABELS.month}
            placeholder={BIRTH_DATE_LABELS.monthPlaceholder}
            maxLength={2}
            autoComplete="bday-month"
            value={month}
            onChange={setMonth}
          />
          <DatePart
            label={BIRTH_DATE_LABELS.year}
            placeholder={BIRTH_DATE_LABELS.yearPlaceholder}
            maxLength={4}
            autoComplete="bday-year"
            value={year}
            onChange={setYear}
          />
        </div>
        {isDateRejected && <p role="alert" className="stop-note">{BIRTH_DATE_LABELS.rejected}</p>}
        {error && !isDateRejected && <p role="alert" className="stop-note">{API_ERROR_LABELS[error.kind]}</p>}
      </form>
    </OnboardingFrame>
  );
}

interface DatePartProps {
  label: string;
  placeholder: string;
  maxLength: number;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}

function DatePart({ label, placeholder, maxLength, autoComplete, value, onChange, inputRef }: DatePartProps) {
  const width = maxLength === 4 ? 'w-[104px]' : 'w-[72px]';

  return (
    <label className="label flex flex-col gap-0.75 text-ink-2">
      {label}
      <input
        ref={inputRef}
        className={`line-input ${width} text-ink`}
        inputMode="numeric"
        maxLength={maxLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
    </label>
  );
}
