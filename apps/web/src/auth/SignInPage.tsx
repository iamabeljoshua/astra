import { type FormEvent, lazy, Suspense, useRef, useState } from 'react';
import { Link } from 'react-router';
import { LEGAL_PATHS } from '../legal/legalPaths';
import { LEGAL_PAGES, SIGN_IN_LABELS } from '../strings';
import { useAuth } from './AuthProvider';
import { OnboardingFrame } from './OnboardingFrame';
import { sendEmailLink, signInWithGoogle, type EmailLinkResult } from './session';
import { StepHeading } from './StepHeading';
import type { SignInDraft } from './useSignInDraft';

type SendFailure = Exclude<EmailLinkResult, 'sent'>;

const GOOGLE_SIGN_IN_FLAG = 'on';
const SEND_PROBLEM_ID = 'send-problem';
const SENT_ABOUT_ID = 'sign-in-sent-about';
const SENT_ADDRESS_ID = 'sign-in-sent-address';
const AGREEMENT_LINK = 'underline underline-offset-2 hover:text-accent';

declare const __DEV_SIGN_IN__: boolean;

const DevSignIn = __DEV_SIGN_IN__ ? lazy(() => import('./DevSignIn')) : null;

export function SignInPage({ draft }: { draft: SignInDraft }) {
  const { step, email, setStep, setEmail } = draft;

  return (
    <OnboardingFrame showsChangeLaterNote>
      {step === 'welcome' && <WelcomeStep onChooseEmail={() => setStep('email')} />}
      {step === 'email' && (
        <EmailStep
          email={email}
          onChangeEmail={setEmail}
          onSent={() => setStep('sent')}
        />
      )}
      {step === 'sent' && <SentStep email={email} onUseAnotherEmail={() => setStep('email')} />}
      {DevSignIn && (
        <Suspense>
          <DevSignIn />
        </Suspense>
      )}
    </OnboardingFrame>
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

function WelcomeStep({ onChooseEmail }: { onChooseEmail: () => void }) {
  const { returnProblem } = useAuth();
  const canUseGoogle = import.meta.env.VITE_GOOGLE_SIGN_IN === GOOGLE_SIGN_IN_FLAG;

  return (
    <>
      <StepHeading className="text-tagline tracking-[-0.005em] uppercase">{SIGN_IN_LABELS.tagline}</StepHeading>
      <p className="max-w-[46ch] text-sub text-ink-2">{SIGN_IN_LABELS.about}</p>
      {returnProblem && <p role="alert" className="stop-note">{SIGN_IN_LABELS[returnProblem]}</p>}
      <div className="flex max-w-90 flex-col gap-2">
        {canUseGoogle && (
          <button type="button" className="button button-solid w-full py-3" onClick={() => void signInWithGoogle()}>
            {SIGN_IN_LABELS.google}
          </button>
        )}
        <button type="button" className="button button-outline w-full py-3" onClick={onChooseEmail}>
          {SIGN_IN_LABELS.email}
        </button>
      </div>
      <AgreementLine />
    </>
  );
}

interface EmailStepProps {
  email: string;
  onChangeEmail: (email: string) => void;
  onSent: () => void;
}

function EmailStep({ email, onChangeEmail, onSent }: EmailStepProps) {
  const input = useRef<HTMLInputElement>(null);
  const [isSending, setIsSending] = useState(false);
  const [failure, setFailure] = useState<SendFailure | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (isSending) return;
    setIsSending(true);
    setFailure(null);
    const result = await sendEmailLink(email.trim());
    setIsSending(false);
    if (result === 'sent') onSent();
    else setFailure(result);
  }

  return (
    <form onSubmit={(event) => void send(event)} className="flex flex-col gap-4.5">
      <StepHeading fieldToFocus={input}>{SIGN_IN_LABELS.emailQuestion}</StepHeading>
      <input
        ref={input}
        className="line-input"
        type="email"
        required
        autoComplete="email"
        aria-label={SIGN_IN_LABELS.emailPlaceholder}
        placeholder={SIGN_IN_LABELS.emailPlaceholder}
        aria-invalid={failure === 'invalidEmail'}
        aria-describedby={failure ? SEND_PROBLEM_ID : undefined}
        value={email}
        onChange={(event) => onChangeEmail(event.target.value)}
      />
      {failure && <p id={SEND_PROBLEM_ID} role="alert" className="stop-note">{SIGN_IN_LABELS[failure]}</p>}
      <div>
        <button type="submit" aria-disabled={isSending} className="button button-solid">
          {SIGN_IN_LABELS.sendLink}
        </button>
      </div>
      <AgreementLine />
    </form>
  );
}

function SentStep({ email, onUseAnotherEmail }: { email: string; onUseAnotherEmail: () => void }) {
  return (
    <>
      <StepHeading describedBy={`${SENT_ABOUT_ID} ${SENT_ADDRESS_ID}`}>{SIGN_IN_LABELS.sentQuestion}</StepHeading>
      <p id={SENT_ABOUT_ID} className="max-w-[46ch] text-sub text-ink-2">{SIGN_IN_LABELS.sentAbout}</p>
      <p id={SENT_ADDRESS_ID} className="font-medium wrap-anywhere">{email}</p>
      <div>
        <button type="button" className="button button-outline" onClick={onUseAnotherEmail}>
          {SIGN_IN_LABELS.useAnotherEmail}
        </button>
      </div>
    </>
  );
}
