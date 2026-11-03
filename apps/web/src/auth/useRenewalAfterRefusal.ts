import { useEffect, useRef, useState } from 'react';
import type { ApiErrorKind } from '../api/apiError';
import { forgetSession, renewSession, type SessionRenewal } from './session';
import type { useAccount } from './useAccount';

const UNAUTHORIZED_STATUS = 401;

interface LastRenewal {
  result: SessionRenewal;
  refusalTime: number;
}

// Once Auth renews a session and the API still refuses it, the fault is on the API side, and only Auth can end a session.
function getSettledKind(lastRenewal: LastRenewal | null, errorUpdatedAt: number): ApiErrorKind | null {
  if (lastRenewal?.result === 'unreachable' && lastRenewal.refusalTime === errorUpdatedAt) return 'network';
  if (lastRenewal?.result === 'renewed' && lastRenewal.refusalTime !== errorUpdatedAt) return 'server';
  return null;
}

// A device clock running behind keeps a dead token in use, so a refused token gets one renewal until an answer succeeds.
export function useRenewalAfterRefusal({ error, errorUpdatedAt, isFetching, refetch }: ReturnType<typeof useAccount>) {
  const isTokenRefused = error?.status === UNAUTHORIZED_STATUS;
  const isRunning = useRef(false);
  const [lastRenewal, setLastRenewal] = useState<LastRenewal | null>(null);
  if (lastRenewal && !isFetching && !isTokenRefused) setLastRenewal(null);

  useEffect(() => {
    if (isFetching || isRunning.current || !isTokenRefused || lastRenewal) return;
    isRunning.current = true;
    void renewSession().then((result) => {
      isRunning.current = false;
      setLastRenewal({ result, refusalTime: errorUpdatedAt });
      if (result === 'renewed') void refetch();
      if (result === 'refused') forgetSession();
    });
  }, [isTokenRefused, isFetching, errorUpdatedAt, lastRenewal, refetch]);

  const settledKind = isTokenRefused && !isFetching ? getSettledKind(lastRenewal, errorUpdatedAt) : null;

  function tryAgain() {
    setLastRenewal(null);
    void refetch();
  }

  return { settledKind, isRenewing: isTokenRefused && !settledKind, tryAgain };
}
