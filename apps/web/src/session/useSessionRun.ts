import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { rethrowUnlessApiError } from '../api/apiError';
import { API_ERROR_LABELS } from '../strings';
import { fadeOutLeavingPage } from './opening';
import { refreshSessionViews, type Session, useUpdateSession } from './sessionQueries';

const TICK_MS = 1_000;
const SAVE_EVERY_MS = 15_000;
const MS_PER_SECOND = 1_000;

function createClock(startingSeconds: number) {
  const openedAtMs = Date.now();
  return () => startingSeconds + Math.floor((Date.now() - openedAtMs) / MS_PER_SECOND);
}

// Stands in for the live session's clock until M3.10.
export function useSessionRun(session: Session) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mutate: saveLength } = useUpdateSession(session.id);
  const finish = useUpdateSession(session.id);
  const [readSeconds] = useState(() => createClock(session.durationSeconds));
  const [seconds, setSeconds] = useState(session.durationSeconds);
  // The mutation's pending flag starts a tick late and ends before the fade, so this guards the whole ending.
  const isEnding = useRef(false);

  useEffect(() => {
    const clock = setInterval(() => setSeconds(readSeconds()), TICK_MS);
    const saving = setInterval(() => saveLength({ durationSeconds: readSeconds() }), SAVE_EVERY_MS);
    return () => {
      clearInterval(clock);
      clearInterval(saving);
    };
  }, [readSeconds, saveLength]);

  async function endSession() {
    if (isEnding.current) return;
    isEnding.current = true;
    try {
      await finish.mutateAsync({ durationSeconds: readSeconds(), status: 'finished' });
      await refreshSessionViews(queryClient);
      await fadeOutLeavingPage();
      navigate('/', { replace: true });
    } catch (thrown) {
      rethrowUnlessApiError(thrown);
    } finally {
      isEnding.current = false;
    }
  }

  return {
    seconds,
    endSession,
    isEnding: finish.isPending,
    endProblem: finish.error && API_ERROR_LABELS[finish.error.kind],
  };
}
