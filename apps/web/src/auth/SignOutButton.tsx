import { useState } from 'react';
import { ACCOUNT_LABELS } from '../strings';
import { signOut } from './session';

interface SignOutButtonProps {
  className: string;
}

export function SignOutButton({ className }: SignOutButtonProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <button
      type="button"
      disabled={isSigningOut}
      className={className}
      onClick={() => {
        setIsSigningOut(true);
        void signOut();
      }}
    >
      {ACCOUNT_LABELS.signOut}
    </button>
  );
}
