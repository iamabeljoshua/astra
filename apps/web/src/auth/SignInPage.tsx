import { type FormEvent, lazy, Suspense, useRef, useState } from 'react';
import { Link } from 'react-router';
import { LEGAL_PATHS } from '../legal/legalPaths';
import { LEGAL_PAGES, SIGN_IN_LABELS } from '../strings';
import { Button } from '../ui/Button';
import { CodeField } from '../ui/CodeField';
import { DOT_DRAWINGS } from '../ui/dots/dotDrawings';
import { DotStage } from '../ui/dots/DotStage';
import { TextField } from '../ui/TextField';
import { TutorQuestion } from '../ui/TutorQuestion';
import { useAuth } from './AuthProvider';
import { CODE_LENGTH, readCodeRequest, sendEmailCode, type SendCodeResult, signInWithGoogle } from './session';
import { useCodeEntry } from './useCodeEntry';
import type { SignInDraft, SignInStep } from './useSignInDraft';

type SendFailure = Exclude<SendCodeResult, 'sent' | 'alreadySent'>;

const GOOGLE_SIGN_IN_FLAG = 'on';
const SENT_TO_ID = 'sign-in-sent-to';
const CODE_PROBLEM_ID = 'sign-in-code-problem';
const AGREEMENT_LINK = 'underline underline-offset-2 hover:text-accent';
const STEP_SHAPES = { email: DOT_DRAWINGS.arc, code: DOT_DRAWINGS.atom } satisfies Record<SignInStep, unknown>;

declare const __DEV_SIGN_IN__: boolean;

const DevSignIn = __DEV_SIGN_IN__ ? lazy(() => import('./DevSignIn')) : null;

export function SignInPage({ draft }: { draft: SignInDraft }) {
  return (
    <DotStage shape={STEP_SHAPES[draft.step]}>
      {draft.step === 'email' ? <EmailStep draft={draft} /> : <CodeStep draft={draft} />}
      {DevSignIn && (
        <Suspense>
          <DevSignIn />
        </Suspense>
      )}
    </DotStage>
  );
}

function AgreementLine() {
  return (
    <p className="text-fine text-ink-2">
      {SIGN_IN_LABELS.agreementStart}
      <Link to={LEGAL_PATHS.terms} className={AGREEMENT_LINK}>{LEGAL_PAGES.terms.title}</Link>
      {SIGN_IN_LABELS.agreementJoin}
      <Link to={LEGAL_PATHS.privacy} className={AGREEMENT_LINK}>{LEGAL_PAGES.privacy.title}</Link>
      {SIGN_IN_LABELS.agreementEnd}
    </p>
  );
}

function ReturnProblem() {
  const { returnProblem } = useAuth();

  return returnProblem && <p role="alert" className="stop-note">{SIGN_IN_LABELS[returnProblem]}</p>;
}

function EmailStep({ draft }: { draft: SignInDraft }) {
  const { email, isSending, setEmail, setIsSending, showCodeStep } = draft;
  const field = useRef<HTMLInputElement>(null);
  const [failure, setFailure] = useState<SendFailure | null>(null);
  const canUseGoogle = import.meta.env.VITE_GOOGLE_SIGN_IN === GOOGLE_SIGN_IN_FLAG;

  async function send(event: FormEvent) {
    event.preventDefault();
    if (isSending) return;
    setIsSending(true);
    setFailure(null);
    const typedEmail = email.trim();
    const result = await sendEmailCode(typedEmail);
    setIsSending(false);
    if (result === 'sent' || result === 'alreadySent') {
      setEmail(typedEmail);
      showCodeStep(readCodeRequest()?.sentAt ?? Date.now());
    } else {
      setFailure(result);
    }
  }

  return (
    <>
      <p className="label pl-tutor-indent text-ink-2">{SIGN_IN_LABELS.tagline}</p>
      <TutorQuestion line={SIGN_IN_LABELS.welcomeLine} fieldToFocus={field}>
        <ReturnProblem />
        <form noValidate onSubmit={(event) => void send(event)} className="flex flex-col gap-4.5">
          <TextField
            inputRef={field}
            label={SIGN_IN_LABELS.emailLabel}
            type="email"
            autoComplete="email"
            placeholder={SIGN_IN_LABELS.emailPlaceholder}
            error={failure === 'invalidEmail' ? SIGN_IN_LABELS.invalidEmail : null}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {failure && failure !== 'invalidEmail' && <p role="alert" className="stop-note">{SIGN_IN_LABELS[failure]}</p>}
          <div className="flex flex-wrap gap-2.5">
            <Button type="submit" isBusy={isSending}>{SIGN_IN_LABELS.sendCode}</Button>
            {canUseGoogle && <Button variant="outline" onClick={() => void signInWithGoogle()}>{SIGN_IN_LABELS.google}</Button>}
          </div>
        </form>
        <AgreementLine />
      </TutorQuestion>
    </>
  );
}

function CodeStep({ draft }: { draft: SignInDraft }) {
  const field = useRef<HTMLInputElement>(null);
  const { code, problem, isChecking, hasSentNewCode, resendSecondsLeft, changeCode, check, resend } = useCodeEntry(draft);

  return (
    <TutorQuestion line={SIGN_IN_LABELS.codeLine} describedBy={SENT_TO_ID} fieldToFocus={field}>
      <ReturnProblem />
      <p id={SENT_TO_ID} className="wrap-anywhere text-ink-2">{SIGN_IN_LABELS.sentTo(draft.email)}</p>
      <CodeField
        inputRef={field}
        label={SIGN_IN_LABELS.codeLabel}
        value={code}
        length={CODE_LENGTH}
        isBusy={isChecking}
        isInvalid={problem !== null}
        describedBy={problem ? CODE_PROBLEM_ID : undefined}
        onChange={changeCode}
        onComplete={(fullCode) => void check(fullCode)}
      />
      {problem && <p id={CODE_PROBLEM_ID} role="alert" className="stop-note">{problem}</p>}
      <p role="status" className="text-fine text-ink-2 empty:hidden">
        {isChecking && SIGN_IN_LABELS.checking}
        {hasSentNewCode && SIGN_IN_LABELS.newCodeSent}
      </p>
      <div className="flex flex-wrap gap-x-5">
        <Button variant="quiet" isBusy={resendSecondsLeft > 0 || draft.isSending} onClick={() => void resend()}>
          {resendSecondsLeft > 0 ? SIGN_IN_LABELS.resendIn(resendSecondsLeft) : SIGN_IN_LABELS.resend}
        </Button>
        <Button variant="quiet" onClick={draft.showEmailStep}>{SIGN_IN_LABELS.useAnotherEmail}</Button>
      </div>
    </TutorQuestion>
  );
}
