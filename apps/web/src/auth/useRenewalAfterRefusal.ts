import { useEffect, useRef, useState } from 'react';
import { forgetSession, renewSession } from './session';
import type { useAccount } from './useAccount';

const UNAUTHORIZED_STATUS = 401;

// A device clock running behind keeps a dead token in use, so one renewal comes before giving up on the session.
// Auth being out of reach says nothing about the session, so that case keeps it and leaves the student where they are.
export function useRenewalAfterRefusal({ error, errorUpdatedAt, refetch }: ReturnType<typeof useAccount>) {
  const isTokenRefused = error?.status === UNAUTHORIZED_STATUS;
  const hasRenewed = useRef(false);
  const [unreachableAtErrorTime, setUnreachableAtErrorTime] = useState<number | null>(null);

  useEffect(() => {
    if (!isTokenRefused) {
      hasRenewed.current = false;
      return;
    }
    if (hasRenewed.current) {
      void forgetSession();
      return;
    }
    hasRenewed.current = true;
    void renewSession().then((renewal) => {
      if (renewal === 'renewed') void refetch();
      if (renewal === 'refused') void forgetSession();
      if (renewal === 'unreachable') {
        hasRenewed.current = false;
        setUnreachableAtErrorTime(errorUpdatedAt);
      }
    });
  }, [isTokenRefused, errorUpdatedAt, refetch]);

  return { isTokenRefused, isRenewing: isTokenRefused && unreachableAtErrorTime !== errorUpdatedAt };
}
