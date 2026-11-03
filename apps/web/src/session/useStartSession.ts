import type { components } from '@astra/contracts';
import { useRef } from 'react';
import { useNavigate } from 'react-router';
import { rethrowUnlessApiError } from '../api/apiError';
import { API_ERROR_LABELS, SESSION_LABELS } from '../strings';
import { fadeOutLeavingPage, getFullStopPoint, holdDot, landDot } from './opening';
import { getSessionPath } from './sessionPath';
import { type NewSession, type Session, useCreateSession } from './sessionQueries';

type PickCard = components['schemas']['PickCardResponseDto'];

const SESSION_LANGUAGE = 'en';
const API_MAX_TITLE_CHARACTERS = 200;

function toSessionTitle(question: string) {
  return Array.from(question.replace(/\s+/g, ' ')).slice(0, API_MAX_TITLE_CHARACTERS).join('').trimEnd();
}

export function useStartSession() {
  const navigate = useNavigate();
  const createSession = useCreateSession();
  // The mutation's pending flag starts a tick late and ends before the fade, so this guards the whole opening.
  const isOpening = useRef(false);

  async function fadeInto(sessionId: string) {
    await fadeOutLeavingPage();
    navigate(getSessionPath(sessionId));
  }

  async function saveAndFadeInto(newSession: NewSession, heldBy?: Promise<void>) {
    const [session] = await Promise.all([createSession.mutateAsync(newSession), heldBy]);
    await fadeInto(session.id);
  }

  function openOnce(open: () => Promise<void>) {
    if (isOpening.current) return;
    isOpening.current = true;
    open()
      .catch(rethrowUnlessApiError)
      .finally(() => {
        isOpening.current = false;
      });
  }

  function startFromQuestion(question: string, textBox: HTMLTextAreaElement) {
    openOnce(async () => {
      const removeDot = landDot(getFullStopPoint(textBox));
      await saveAndFadeInto(
        { title: toSessionTitle(question), subject: SESSION_LABELS.questionSubject, language: SESSION_LANGUAGE },
        holdDot(),
      ).finally(removeDot);
    });
  }

  function startFromPick({ title, subject, artwork }: PickCard) {
    openOnce(() => saveAndFadeInto({ title, subject, artwork, language: SESSION_LANGUAGE }));
  }

  function continueSession({ id }: Session) {
    openOnce(() => fadeInto(id));
  }

  return {
    startFromQuestion,
    startFromPick,
    continueSession,
    isStarting: createSession.isPending,
    problem: createSession.error && API_ERROR_LABELS[createSession.error.kind],
    clearProblem: createSession.reset,
  };
}
