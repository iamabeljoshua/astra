import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ACCOUNT_LABELS } from '../strings';
import { signOut } from './session';

interface SignOutButtonProps {
  className: string;
}

export function SignOutButton({ className }: SignOutButtonProps) {
  const queryClient = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <button
      type="button"
      disabled={isSigningOut}
      className={`${className} disabled:opacity-35`}
      onClick={() => {
        setIsSigningOut(true);
        queryClient.clear();
        signOut();
      }}
    >
      {ACCOUNT_LABELS.signOut}
    </button>
  );
}
