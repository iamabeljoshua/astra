import { type FormEvent, type RefObject, useRef, useState } from 'react';
import { API_ERROR_LABELS, BIRTH_DATE_LABELS } from '../strings';
import { type DateParts, formatBirthDate, toBirthDate } from './birthDateParts';
import { OnboardingFrame } from './OnboardingFrame';
import { SignOutButton } from './SignOutButton';
import { StepHeading } from './StepHeading';
import { useAnswerBirthDate } from './useAccount';

const FORM_ID = 'birth-date';
const QUESTION_ID = 'birth-date-question';
const PROBLEM_ID = 'birth-date-problem';
const TYPED_DATE_ID = 'birth-date-typed';

const EMPTY_DATE: DateParts = { day: '', month: '', year: '' };

const DATE_FIELDS = [
  { part: 'day', label: BIRTH_DATE_LABELS.day, placeholder: BIRTH_DATE_LABELS.dayPlaceholder, maxLength: 2, width: 'w-[72px]', autoComplete: 'bday-day' },
  { part: 'month', label: BIRTH_DATE_LABELS.month, placeholder: BIRTH_DATE_LABELS.monthPlaceholder, maxLength: 2, width: 'w-[72px]', autoComplete: 'bday-month' },
  { part: 'year', label: BIRTH_DATE_LABELS.year, placeholder: BIRTH_DATE_LABELS.yearPlaceholder, maxLength: 4, width: 'w-[104px]', autoComplete: 'bday-year' },
] as const;

export function BirthDatePage() {
  const answerBirthDate = useAnswerBirthDate();
  const [dateParts, setDateParts] = useState(EMPTY_DATE);
  const [dateToConfirm, setDateToConfirm] = useState<string | null>(null);
  const [isDateRejected, setIsDateRejected] = useState(false);

  function reviewDate() {
    const birthDate = toBirthDate(dateParts);
    setIsDateRejected(!birthDate);
    setDateToConfirm(birthDate);
  }

  function changeDate() {
    setDateToConfirm(null);
    answerBirthDate.reset();
  }

  function confirmDate() {
    if (!dateToConfirm || answerBirthDate.isPending) return;
    answerBirthDate.mutate(dateToConfirm, {
      onError: ({ kind }) => {
        if (kind !== 'validation') return;
        setIsDateRejected(true);
        setDateToConfirm(null);
      },
    });
  }

  function changePart(part: keyof DateParts, value: string) {
    setDateParts({ ...dateParts, [part]: value });
    setIsDateRejected(false);
    answerBirthDate.reset();
  }

  return (
    <OnboardingFrame footer={<SignOutButton className="font-medium text-ink-2 hover:text-ink" />}>
      {dateToConfirm ? (
        <ConfirmStep
          typedDate={formatBirthDate(dateToConfirm)}
          isSending={answerBirthDate.isPending}
          problem={answerBirthDate.error && API_ERROR_LABELS[answerBirthDate.error.kind]}
          onConfirm={confirmDate}
          onChange={changeDate}
        />
      ) : (
        <EntryStep dateParts={dateParts} isDateRejected={isDateRejected} onChangePart={changePart} onSubmit={reviewDate} />
      )}
    </OnboardingFrame>
  );
}

interface EntryStepProps {
  dateParts: DateParts;
  isDateRejected: boolean;
  onChangePart: (part: keyof DateParts, value: string) => void;
  onSubmit: () => void;
}

function EntryStep({ dateParts, isDateRejected, onChangePart, onSubmit }: EntryStepProps) {
  const firstField = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
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
            onChange={(value) => onChangePart(field.part, value)}
          />
        ))}
      </div>
      {isDateRejected && <p id={PROBLEM_ID} role="alert" className="stop-note">{BIRTH_DATE_LABELS.rejected}</p>}
      <div>
        <button type="submit" className="button button-solid">{BIRTH_DATE_LABELS.next}</button>
      </div>
    </form>
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

interface ConfirmStepProps {
  typedDate: string;
  isSending: boolean;
  problem: string | null;
  onConfirm: () => void;
  onChange: () => void;
}

function ConfirmStep({ typedDate, isSending, problem, onConfirm, onChange }: ConfirmStepProps) {
  return (
    <>
      <StepHeading describedBy={TYPED_DATE_ID}>{BIRTH_DATE_LABELS.confirmQuestion}</StepHeading>
      <p id={TYPED_DATE_ID} className="text-entry">{typedDate}</p>
      {problem && <p role="alert" className="stop-note">{problem}</p>}
      <div className="flex flex-wrap gap-2.5">
        <button type="button" aria-disabled={isSending} aria-describedby={TYPED_DATE_ID} className="button button-solid" onClick={onConfirm}>
          {BIRTH_DATE_LABELS.confirm}
        </button>
        <button type="button" className="button button-outline" onClick={onChange}>
          {BIRTH_DATE_LABELS.change}
        </button>
      </div>
    </>
  );
}
