import { type FormEvent, lazy, Suspense, useRef, useState } from 'react';
import { SIGN_IN_LABELS } from '../strings';
import { useAuth } from './AuthProvider';
import { OnboardingFrame } from './OnboardingFrame';
import { sendEmailLink, signInWithGoogle, type EmailLinkResult } from './session';
import { useFocusOnWideScreen } from './useFocusOnWideScreen';

type SignInStep = 'welcome' | 'email' | 'sent';
type SendFailure = Exclude<EmailLinkResult, 'sent'>;

const GOOGLE_SIGN_IN_FLAG = 'on';

declare const __DEV_SIGN_IN__: boolean;

// vite.config.ts sets this to true only for the dev server, so a build drops this branch and its file whatever its settings.
const DevSignIn = __DEV_SIGN_IN__ ? lazy(() => import('./DevSignIn')) : null;

export function SignInPage() {
  const [step, setStep] = useState<SignInStep>('welcome');
  const [email, setEmail] = useState('');

  return (
    <OnboardingFrame>
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

function WelcomeStep({ onChooseEmail }: { onChooseEmail: () => void }) {
  const { didLinkFail } = useAuth();
  const canUseGoogle = import.meta.env.VITE_GOOGLE_SIGN_IN === GOOGLE_SIGN_IN_FLAG;

  return (
    <>
      <h1 className="text-tagline font-semibold tracking-[-0.005em] text-balance uppercase">{SIGN_IN_LABELS.tagline}</h1>
      <p className="max-w-[46ch] text-sub text-ink-2">{SIGN_IN_LABELS.about}</p>
      {didLinkFail && <p role="alert" className="stop-note">{SIGN_IN_LABELS.linkFailed}</p>}
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
      <p className="text-fine text-ink-2">{SIGN_IN_LABELS.terms}</p>
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
  useFocusOnWideScreen(input);

  async function send(event: FormEvent) {
    event.preventDefault();
    setIsSending(true);
    const result = await sendEmailLink(email.trim());
    setIsSending(false);
    if (result === 'sent') onSent();
    else setFailure(result);
  }

  return (
    <form onSubmit={(event) => void send(event)} className="flex flex-col gap-4.5">
      <h1 className="text-question font-semibold text-balance">{SIGN_IN_LABELS.emailQuestion}</h1>
      <input
        ref={input}
        className="line-input"
        type="email"
        required
        autoComplete="email"
        aria-label={SIGN_IN_LABELS.emailPlaceholder}
        placeholder={SIGN_IN_LABELS.emailPlaceholder}
        value={email}
        onChange={(event) => onChangeEmail(event.target.value)}
      />
      {failure && <p role="alert" className="stop-note">{SIGN_IN_LABELS[failure]}</p>}
      <div>
        <button type="submit" disabled={isSending} className="button button-solid">
          {SIGN_IN_LABELS.sendLink}
        </button>
      </div>
    </form>
  );
}

function SentStep({ email, onUseAnotherEmail }: { email: string; onUseAnotherEmail: () => void }) {
  return (
    <>
      <h1 className="text-question font-semibold text-balance">{SIGN_IN_LABELS.sentQuestion}</h1>
      <p className="max-w-[46ch] text-sub text-ink-2">{SIGN_IN_LABELS.sentAbout}</p>
      <p className="font-medium wrap-anywhere">{email}</p>
      <div>
        <button type="button" className="button button-outline" onClick={onUseAnotherEmail}>
          {SIGN_IN_LABELS.useAnotherEmail}
        </button>
      </div>
    </>
  );
}
