import { useState } from 'react';

export type SignInStep = 'welcome' | 'email' | 'sent';

export interface SignInDraft {
  step: SignInStep;
  email: string;
  setStep: (step: SignInStep) => void;
  setEmail: (email: string) => void;
}

// Held above the routes, so reading the Terms or the Privacy Policy and coming back keeps what the student typed.
export function useSignInDraft(): SignInDraft {
  const [step, setStep] = useState<SignInStep>('welcome');
  const [email, setEmail] = useState('');

  return { step, email, setStep, setEmail };
}
