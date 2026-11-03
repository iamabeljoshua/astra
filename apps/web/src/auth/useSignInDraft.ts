import { useState } from 'react';
import { type CodeRequest, isCodeStillGood, readCodeRequest } from './session';

export type SignInStep = 'email' | 'code';

export interface SignInDraft {
  step: SignInStep;
  email: string;
  isSending: boolean;
  codeSentAt: number;
  showCodeStep: (sentAt: number) => void;
  showEmailStep: () => void;
  setEmail: (email: string) => void;
  setIsSending: (isSending: boolean) => void;
}

function readLiveCodeRequest(): CodeRequest | null {
  const request = readCodeRequest();
  return request && isCodeStillGood(request) ? request : null;
}

// A phone can reload the tab while a student reads their email, so the code step comes back from this tab's record.
export function useSignInDraft(): SignInDraft {
  const [liveRequest] = useState(readLiveCodeRequest);
  const [step, setStep] = useState<SignInStep>(liveRequest ? 'code' : 'email');
  const [email, setEmail] = useState(liveRequest?.email ?? '');
  const [isSending, setIsSending] = useState(false);
  const [codeSentAt, setCodeSentAt] = useState(liveRequest?.sentAt ?? 0);

  function showCodeStep(sentAt: number) {
    setCodeSentAt(sentAt);
    setStep('code');
  }

  return { step, email, isSending, codeSentAt, showCodeStep, showEmailStep: () => setStep('email'), setEmail, setIsSending };
}
