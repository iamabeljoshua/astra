import { useEffect, useRef, useState } from 'react';
import { SIGN_IN_LABELS } from '../strings';
import { checkEmailCode, type CheckCodeResult, readCodeRequest, RESEND_WAIT_MS, sendEmailCode } from './session';
import type { SignInDraft } from './useSignInDraft';

const MS_PER_SECOND = 1000;
const CHECK_PROBLEM_LABELS = {
  codeWrong: SIGN_IN_LABELS.codeWrong,
  codeExpired: SIGN_IN_LABELS.codeExpired,
  tooManyTries: SIGN_IN_LABELS.tooManyTries,
  authFailed: SIGN_IN_LABELS.checkAuthFailed,
  failed: SIGN_IN_LABELS.checkFailed,
} satisfies Record<Exclude<CheckCodeResult, 'signedIn'>, string>;

function useResendWait(codeSentAt: number) {
  const [now, setNow] = useState(Date.now);
  const secondsLeft = Math.max(0, Math.min(RESEND_WAIT_MS, codeSentAt + RESEND_WAIT_MS - now)) / MS_PER_SECOND;
  const isWaiting = secondsLeft > 0;

  useEffect(() => {
    if (!isWaiting) return undefined;
    const timer = setInterval(() => setNow(Date.now()), MS_PER_SECOND);
    return () => clearInterval(timer);
  }, [isWaiting]);

  return Math.ceil(secondsLeft);
}

export function useCodeEntry({ email, codeSentAt, code, setCode, isSending, setIsSending, showCodeStep }: SignInDraft) {
  const [problem, setProblem] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [hasSentNewCode, setHasSentNewCode] = useState(false);
  const isCheckOnItsWay = useRef(false);
  const resendSecondsLeft = useResendWait(codeSentAt);

  function changeCode(nextCode: string) {
    setCode(nextCode);
    setProblem(null);
    setHasSentNewCode(false);
  }

  async function check(fullCode: string) {
    if (isCheckOnItsWay.current) return;
    isCheckOnItsWay.current = true;
    setIsChecking(true);
    const result = await checkEmailCode(email, fullCode, codeSentAt);
    isCheckOnItsWay.current = false;
    setIsChecking(false);
    if (result === 'signedIn') return;
    setProblem(CHECK_PROBLEM_LABELS[result]);
    setCode('');
  }

  async function resend() {
    if (isSending || resendSecondsLeft > 0) return;
    setIsSending(true);
    setProblem(null);
    setHasSentNewCode(false);
    const result = await sendEmailCode(email);
    setIsSending(false);
    if (result === 'sent' || result === 'alreadySent') {
      showCodeStep(readCodeRequest()?.sentAt ?? Date.now());
      setCode('');
      setHasSentNewCode(true);
    } else {
      setProblem(SIGN_IN_LABELS[result]);
    }
  }

  return { code, problem, isChecking, hasSentNewCode, resendSecondsLeft, changeCode, check, resend };
}
