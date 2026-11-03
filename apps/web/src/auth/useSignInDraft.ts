import { useState } from 'react';

export type SignInStep = 'welcome' | 'email' | 'sent';

export interface SignInDraft {
  step: SignInStep;
  email: string;
  isSending: boolean;
  setStep: (step: SignInStep) => void;
  setEmail: (email: string) => void;
  setIsSending: (isSending: boolean) => void;
}

export function useSignInDraft(): SignInDraft {
  const [step, setStep] = useState<SignInStep>('welcome');
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);

  return { step, email, isSending, setStep, setEmail, setIsSending };
}
