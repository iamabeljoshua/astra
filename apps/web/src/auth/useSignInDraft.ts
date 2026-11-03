import { useState } from 'react';

export type SignInStep = 'welcome' | 'email' | 'sent';

export interface SignInDraft {
  step: SignInStep;
  email: string;
  setStep: (step: SignInStep) => void;
  setEmail: (email: string) => void;
}

export function useSignInDraft(): SignInDraft {
  const [step, setStep] = useState<SignInStep>('welcome');
  const [email, setEmail] = useState('');

  return { step, email, setStep, setEmail };
}
