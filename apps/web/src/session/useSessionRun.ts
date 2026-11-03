import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { API_ERROR_LABELS } from '../strings';
import { fadeOutPage } from './opening';
import { refreshSessionViews, type Session, useUpdateSession } from './sessionQueries';

const TICK_MS = 1_000;
const SAVE_EVERY_MS = 15_000;
const MS_PER_SECOND = 1_000;

function createClock(startingSeconds: number) {
  const openedAtMs = Date.now();
  return () => startingSeconds + Math.floor((Date.now() - openedAtMs) / MS_PER_SECOND);
}

// Stands in for the live session's clock until M3.10. Saving as it runs means a refresh loses seconds, not the length.
export function useSessionRun(session: Session) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mutate: saveLength } = useUpdateSession(session.id);
  const finish = useUpdateSession(session.id);
  const [readSeconds] = useState(() => createClock(session.durationSeconds));
  const [seconds, setSeconds] = useState(session.durationSeconds);
  // The mutation reports pending only after a tick, so a second click inside it would otherwise send twice.
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
      await fadeOutPage();
      navigate('/', { replace: true });
    } catch {
      // The mutation holds the error, and the screen shows it.
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
