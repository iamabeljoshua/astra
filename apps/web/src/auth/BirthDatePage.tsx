import { type FormEvent, useRef } from 'react';
import { BIRTH_DATE_LABELS } from '../strings';
import { BirthDateField } from '../ui/BirthDateField';
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

export function BirthDatePage() {
  const steps = useBirthDateSteps();

  return steps.dateToConfirm ? <ConfirmStep {...steps} dateToConfirm={steps.dateToConfirm} /> : <EntryStep {...steps} />;
}

type Steps = ReturnType<typeof useBirthDateSteps>;

function EntryStep({ dateParts, isDateRejected, changeParts, reviewDate }: Steps) {
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
        <BirthDateField
          labelledBy={QUESTION_ID}
          value={dateParts}
          isInvalid={isDateRejected}
          describedBy={isDateRejected ? PROBLEM_ID : undefined}
          firstFieldRef={firstField}
          onChange={changeParts}
        />
        {isDateRejected && <p id={PROBLEM_ID} role="alert" className="stop-note">{BIRTH_DATE_LABELS.rejected}</p>}
      </form>
    </OnboardingFrame>
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
