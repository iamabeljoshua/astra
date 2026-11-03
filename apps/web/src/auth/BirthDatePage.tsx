import { type FormEvent, type RefObject, useRef } from 'react';
import { BIRTH_DATE_LABELS } from '../strings';
import { formatBirthDate } from './birthDateParts';
import { OnboardingFrame } from './OnboardingFrame';
import { SignOutButton } from './SignOutButton';
import { StepHeading } from './StepHeading';
import { useBirthDateSteps } from './useBirthDateSteps';

const FORM_ID = 'birth-date';
const QUESTION_ID = 'birth-date-question';
const PROBLEM_ID = 'birth-date-problem';
const TYPED_DATE_ID = 'birth-date-typed';
const SIGN_OUT_STYLE = 'font-medium text-ink-2 hover:text-ink';

const DATE_FIELDS = [
  { part: 'day', label: BIRTH_DATE_LABELS.day, placeholder: BIRTH_DATE_LABELS.dayPlaceholder, maxLength: 2, width: 'w-[72px]', autoComplete: 'bday-day' },
  { part: 'month', label: BIRTH_DATE_LABELS.month, placeholder: BIRTH_DATE_LABELS.monthPlaceholder, maxLength: 2, width: 'w-[72px]', autoComplete: 'bday-month' },
  { part: 'year', label: BIRTH_DATE_LABELS.year, placeholder: BIRTH_DATE_LABELS.yearPlaceholder, maxLength: 4, width: 'w-[104px]', autoComplete: 'bday-year' },
] as const;

export function BirthDatePage() {
  const steps = useBirthDateSteps();

  return steps.dateToConfirm ? <ConfirmStep {...steps} dateToConfirm={steps.dateToConfirm} /> : <EntryStep {...steps} />;
}

type Steps = ReturnType<typeof useBirthDateSteps>;

function EntryStep({ dateParts, isDateRejected, changePart, reviewDate }: Steps) {
  const firstField = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    reviewDate();
  }

  return (
    <OnboardingFrame
      footer={
        <>
          <SignOutButton className={SIGN_OUT_STYLE} />
          <button type="submit" form={FORM_ID} className="button button-solid">{BIRTH_DATE_LABELS.next}</button>
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
        {isDateRejected && <p id={PROBLEM_ID} role="alert" className="stop-note">{BIRTH_DATE_LABELS.rejected}</p>}
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

function ConfirmStep({ dateToConfirm, isSending, sendProblem, confirmDate, changeDate }: Steps & { dateToConfirm: string }) {
  return (
    <OnboardingFrame
      footer={
        <>
          <SignOutButton className={SIGN_OUT_STYLE} />
          <div className="flex gap-2.5">
            <button type="button" className="button button-outline" onClick={changeDate}>
              {BIRTH_DATE_LABELS.change}
            </button>
            <button type="button" aria-disabled={isSending} aria-describedby={TYPED_DATE_ID} className="button button-solid" onClick={confirmDate}>
              {BIRTH_DATE_LABELS.confirm}
            </button>
          </div>
        </>
      }
    >
      <StepHeading describedBy={TYPED_DATE_ID}>{BIRTH_DATE_LABELS.confirmQuestion}</StepHeading>
      <p id={TYPED_DATE_ID} className="text-entry">{formatBirthDate(dateToConfirm)}</p>
      {sendProblem && <p role="alert" className="stop-note">{sendProblem}</p>}
    </OnboardingFrame>
  );
}
