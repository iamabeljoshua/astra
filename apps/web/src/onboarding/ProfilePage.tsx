import { type FormEvent, type PropsWithChildren, useState } from 'react';
import { useAccount, useSaveProfile } from '../auth/useAccount';
import { API_ERROR_LABELS, PROFILE_LABELS, STUDENT_GOAL_LABELS, STUDENT_LEVEL_LABELS, TUTOR_NOTES_LABELS } from '../strings';
import { type Answers, getInitialAnswers, type StudentGoal, type StudentLevel, STUDENT_GOALS, STUDENT_LEVELS, toProfileBody } from './answers';
import { isStorableName, MAX_NAME_LENGTH } from './fieldLimits';
import { InterestsField } from './InterestsField';
import { OptionRows } from './OptionRows';
import type { Student } from './steps';

export function ProfilePage() {
  const { data: account } = useAccount();
  return account?.student ? <ProfileForm student={account.student} /> : null;
}

function ProfileForm({ student }: { student: Student }) {
  const [answers, setAnswers] = useState(() => getInitialAnswers(student));
  const [isMissing, setIsMissing] = useState(false);
  const saveProfile = useSaveProfile();
  const problem = isMissing ? PROFILE_LABELS.missing : saveProfile.error && API_ERROR_LABELS[saveProfile.error.kind];

  function change(answerChange: Partial<Answers>) {
    setAnswers({ ...answers, ...answerChange });
    setIsMissing(false);
    saveProfile.reset();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = toProfileBody(answers);
    const hasName = isStorableName(answers.name);
    setIsMissing(!hasName);
    if (body && hasName && !saveProfile.isPending) saveProfile.mutate(body);
  }

  return (
    <form onSubmit={submit} className="flex max-w-onboarding flex-col gap-5.5">
      <header>
        <h1 tabIndex={-1} className="text-title font-semibold outline-none">{PROFILE_LABELS.title}</h1>
        <p className="mt-1 text-ink-2">{PROFILE_LABELS.about}</p>
      </header>
      <Field label={PROFILE_LABELS.name}>
        <input className="line-input" aria-label={PROFILE_LABELS.name} maxLength={MAX_NAME_LENGTH} value={answers.name} onChange={(event) => change({ name: event.target.value })} />
      </Field>
      <Field label={TUTOR_NOTES_LABELS.level}>
        <OptionRows<StudentLevel> options={STUDENT_LEVELS} labels={STUDENT_LEVEL_LABELS} selected={answers.level} onPick={(level) => change({ level })} />
      </Field>
      <Field label={TUTOR_NOTES_LABELS.into}>
        <InterestsField selected={answers.interests} onChange={(interests) => change({ interests })} />
      </Field>
      <Field label={TUTOR_NOTES_LABELS.goal}>
        <OptionRows<StudentGoal> options={STUDENT_GOALS} labels={STUDENT_GOAL_LABELS} selected={answers.goal} onPick={(goal) => change({ goal })} />
      </Field>
      {problem && <p role="alert" className="stop-note">{problem}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" aria-disabled={saveProfile.isPending} className="button button-solid">{PROFILE_LABELS.save}</button>
        <p role="status" className="text-fine text-ink-2">{saveProfile.isPending && PROFILE_LABELS.saving}{saveProfile.isSuccess && PROFILE_LABELS.saved}</p>
      </div>
    </form>
  );
}

function Field({ label, children }: PropsWithChildren<{ label: string }>) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-line pt-4.5">
      <h2 className="label text-ink-2">{label}</h2>
      {children}
    </section>
  );
}
