import type { components } from '@astra/contracts';
import { useRef } from 'react';
import { useNavigate } from 'react-router';
import { API_ERROR_LABELS, SESSION_LABELS } from '../strings';
import { fadeOutPage, getFullStopPoint, holdDot, landDot } from './opening';
import { getSessionPath } from './sessionPath';
import { type NewSession, type Session, useCreateSession } from './sessionQueries';

type PickCard = components['schemas']['PickCardResponseDto'];

const SESSION_LANGUAGE = 'en';
const MAX_TITLE_CHARACTERS = 200;

// A question can be any length, and a title is one line of at most the length the API takes.
function toSessionTitle(question: string) {
  return Array.from(question.replace(/\s+/g, ' ')).slice(0, MAX_TITLE_CHARACTERS).join('').trimEnd();
}

export function useStartSession() {
  const navigate = useNavigate();
  const createSession = useCreateSession();
  // The mutation reports pending only after a tick, so a second click inside it would otherwise start two.
  const isOpening = useRef(false);

  async function fadeInto(sessionId: string) {
    await fadeOutPage();
    navigate(getSessionPath(sessionId));
  }

  // The session is saved before the page fades, so a refresh on the session screen always finds it.
  async function saveAndFadeInto(newSession: NewSession, heldBy?: Promise<void>) {
    const [session] = await Promise.all([createSession.mutateAsync(newSession), heldBy]);
    await fadeInto(session.id);
  }

  function openOnce(open: () => Promise<void>) {
    if (isOpening.current) return;
    isOpening.current = true;
    open()
      // The mutation holds the error, and the screen shows it.
      .catch(() => undefined)
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
