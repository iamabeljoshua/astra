import { type FormEvent, useRef } from 'react';
import { BIRTH_DATE_LABELS } from '../strings';
import { BirthDateField } from '../ui/BirthDateField';
import { TutorQuestion } from '../ui/TutorQuestion';
import { formatBirthDate } from './birthDateParts';
import { StepFooter } from './StepFooter';
import { useBirthDateSteps } from './useBirthDateSteps';

const FORM_ID = 'birth-date';
const QUESTION_ID = 'birth-date-question';
const PROBLEM_ID = 'birth-date-problem';
const TYPED_DATE_ID = 'birth-date-typed';

interface BirthDatePageProps {
  studentName: string;
  progress: string;
  onBack?: () => void;
}

export function BirthDatePage({ studentName, progress, onBack }: BirthDatePageProps) {
  const steps = useBirthDateSteps(studentName);

  return steps.dateToConfirm ? (
    <ConfirmStep {...steps} dateToConfirm={steps.dateToConfirm} progress={progress} />
  ) : (
    <EntryStep {...steps} studentName={studentName} progress={progress} onBack={onBack} />
  );
}

type Steps = ReturnType<typeof useBirthDateSteps> & { progress: string };

function EntryStep({ studentName, dateParts, isDateRejected, changeParts, reviewDate, progress, onBack }: Steps & { studentName: string; onBack?: () => void }) {
  const firstField = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    reviewDate();
  }

  return (
    <TutorQuestion id={QUESTION_ID} line={BIRTH_DATE_LABELS.questionFor(studentName)} fieldToFocus={firstField}>
      <form id={FORM_ID} noValidate onSubmit={submit} className="flex flex-col gap-4.5">
        <p className="text-sub text-ink-2">{BIRTH_DATE_LABELS.about}</p>
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
      <StepFooter
        progress={progress}
        onBack={onBack}
        action={<button type="submit" form={FORM_ID} className="button button-solid">{BIRTH_DATE_LABELS.next}</button>}
      />
    </TutorQuestion>
  );
}

function ConfirmStep({ dateToConfirm, isSending, sendProblem, confirmDate, changeDate, progress }: Steps & { dateToConfirm: string }) {
  return (
    <TutorQuestion line={BIRTH_DATE_LABELS.confirmQuestion} describedBy={TYPED_DATE_ID}>
      <p id={TYPED_DATE_ID} className="text-entry">{formatBirthDate(dateToConfirm)}</p>
      {sendProblem && <p role="alert" className="stop-note">{sendProblem}</p>}
      <p role="status" className="sr-only">{isSending && BIRTH_DATE_LABELS.saving}</p>
      <StepFooter
        progress={progress}
        action={
          <div className="flex gap-2.5">
            <button type="button" className="button button-outline" onClick={changeDate}>
              {BIRTH_DATE_LABELS.change}
            </button>
            <button type="button" aria-disabled={isSending} aria-describedby={TYPED_DATE_ID} className="button button-solid" onClick={confirmDate}>
              {BIRTH_DATE_LABELS.confirm}
            </button>
          </div>
        }
      />
    </TutorQuestion>
  );
}
