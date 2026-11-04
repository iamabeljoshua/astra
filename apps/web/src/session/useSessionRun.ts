import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { rethrowUnlessApiError } from '../api/apiError';
import { API_ERROR_LABELS } from '../strings';
import { ARRIVING_FROM_ENDED_SESSION } from './sessionPath';
import { refreshSessionViews, type Session, useUpdateSession } from './sessionQueries';
import { useLeavePage } from './useLeavePage';

const TICK_MS = 1_000;
const SAVE_EVERY_MS = 15_000;
const MS_PER_SECOND = 1_000;

function createClock(startingSeconds: number) {
  const openedAtMs = Date.now();
  // A device clock set back must not turn the length negative, which the API would refuse.
  return () => startingSeconds + Math.floor(Math.max(Date.now() - openedAtMs, 0) / MS_PER_SECOND);
}

// Stands in for the live session's clock until M3.10. The session is finished the moment the student presses End, whatever becomes of the recap.
export function useSessionRun(session: Session, askForRecap: () => boolean) {
  const queryClient = useQueryClient();
  const { fadeInto } = useLeavePage();
  const { mutate: saveLength } = useUpdateSession(session.id);
  const finish = useUpdateSession(session.id);
  const [readSeconds] = useState(() => createClock(session.durationSeconds));
  const [seconds, setSeconds] = useState(session.durationSeconds);
  const [isEnding, setIsEnding] = useState(false);
  const [isRecapping, setIsRecapping] = useState(false);

  useEffect(() => {
    if (isRecapping) return undefined;
    const clock = setInterval(() => setSeconds(readSeconds()), TICK_MS);
    const saving = setInterval(() => saveLength({ durationSeconds: readSeconds() }), SAVE_EVERY_MS);
    return () => {
      clearInterval(clock);
      clearInterval(saving);
    };
  }, [readSeconds, saveLength, isRecapping]);

  async function leave() {
    await refreshSessionViews(queryClient);
    await fadeInto('/', { replace: true, state: ARRIVING_FROM_ENDED_SESSION });
  }

  async function endSession() {
    if (isEnding) return;
    setIsEnding(true);
    const isRecapComing = askForRecap();
    try {
      await finish.mutateAsync({ durationSeconds: readSeconds(), status: 'finished', ...(isRecapComing ? { keepsRoomForRecap: true } : {}) });
      if (isRecapComing) setIsRecapping(true);
      else await leave();
    } catch (thrown) {
      setIsEnding(false);
      rethrowUnlessApiError(thrown);
    }
  }

  return {
    seconds,
    endSession,
    leave,
    isEnding,
    isRecapping,
    endProblem: finish.error && API_ERROR_LABELS[finish.error.kind],
  };
}
