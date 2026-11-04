import { lazy, type PropsWithChildren, type ReactNode, type RefObject, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ChatBox } from '../home/ChatBox';
import { findArtwork, type Artwork } from '../home/artwork';
import { API_ERROR_LABELS, MENU_LABELS, PRODUCT_NAME, REPLY_BOX_LABELS, SESSION_LABELS, SESSIONS_LABELS, VOICE_LABELS } from '../strings';
import { ThemeToggle } from '../theme/ThemeToggle';
import { formatSessionLength } from './formatSession';
import { type Session, useSession } from './sessionQueries';
import { useSessionRun } from './useSessionRun';
import { StudentCaption } from '../voice/Captions';
import { BoardCaption } from '../board/BoardCaption';
import { LiveBoard } from '../voice/LiveBoard';
import { isVoiceOver, type LiveVoiceView } from '../voice/liveVoice';
import { ConnectingSaturn } from './ConnectingSaturn';
import { type LiveVoiceControls, useLiveVoice } from '../voice/useLiveVoice';

const NOT_FOUND_STATUS = 404;
const BAD_ID_STATUS = 400;
const BAR_ACTION = 'button button-outline px-3 py-1.25';

function isWrongAddress(status?: number | null) {
  return status === NOT_FOUND_STATUS || status === BAD_ID_STATUS;
}

export function SessionScreen() {
  const { sessionId } = useParams<'sessionId'>();
  const session = useSession(sessionId!);

  if (session.data) return <OpenSession key={session.data.id} session={session.data} />;
  if (isWrongAddress(session.error?.status)) return <SessionProblem message={SESSION_LABELS.notFound} />;
  if (session.error) {
    return (
      <SessionProblem message={API_ERROR_LABELS[session.error.kind]}>
        <button type="button" aria-disabled={session.isFetching} onClick={() => void session.refetch()} className="button button-outline">
          {SESSION_LABELS.tryAgain}
        </button>
      </SessionProblem>
    );
  }
  return (
    <SessionFrame>
      <p role="status" className="sr-only">{SESSION_LABELS.loading}</p>
    </SessionFrame>
  );
}

// The view is chosen once, so ending the session does not swap the screen while it fades out.
function OpenSession({ session }: { session: Session }) {
  const [wasFinishedOnOpening] = useState(session.status === 'finished');
  return wasFinishedOnOpening ? <FinishedSession session={session} /> : <RunningSession session={session} />;
}

// Every session speaks first, so a student is never left waiting on a blank screen. Sending this opens the room.
export function getOpeningMessage({ title, subject, durationSeconds }: Pick<Session, 'title' | 'subject' | 'durationSeconds'>): string {
  if (durationSeconds > 0) return SESSION_LABELS.carryOnWith(title);
  return subject === SESSION_LABELS.questionSubject ? title : SESSION_LABELS.askAboutTopic(title);
}

// React runs effects twice in development, and the room must open once, so this waits for the first run to settle.
function useOpeningMessage(session: Session, sendTyped: (text: string) => Promise<boolean>) {
  const [opening] = useState(() => getOpeningMessage(session));
  const hasSent = useRef(false);

  useEffect(() => {
    const sending = setTimeout(() => {
      if (hasSent.current) return;
      hasSent.current = true;
      void sendTyped(opening);
    });
    return () => clearTimeout(sending);
  }, [opening, sendTyped]);
}

function isTutorOnTheWay(status: LiveVoiceControls['status'], view: LiveVoiceView | null): boolean {
  if (view) return !view.hasTutorStarted && !isVoiceOver(view.phase) && view.phase !== 'reconnecting' && !view.closedBecause;
  return status === 'idle' || status === 'connecting';
}

/** Long enough for a student to think, so the prompt never hurries an answer on its way. */
const ANSWER_PROMPT_AFTER_MS = 8000;
/** A normal connection is done by now, so only a slow one brings the reply box back. */
const REPLY_BOX_BACK_AFTER_MS = 8000;

// A change to startsOver begins the wait again.
function useHasWaited(isWaiting: boolean, waitMs: number, startsOver = 0): boolean {
  const [hasWaited, setHasWaited] = useState(false);

  useEffect(() => {
    if (!isWaiting) return undefined;
    const waiting = setTimeout(() => setHasWaited(true), waitMs);
    return () => {
      clearTimeout(waiting);
      setHasWaited(false);
    };
  }, [isWaiting, waitMs, startsOver]);

  return isWaiting && hasWaited;
}

// The tutor does not nag out loud. Once it has stopped and the student has done nothing for a while, the page says what they can do.
function useIsAnswerDue(view: LiveVoiceView | null, draftEdits: number): boolean {
  const isWaiting = view !== null && view.phase === 'live' && view.mic === 'off' && !view.closedBecause && !view.isTutorSpeaking && !view.isThinking && !view.isHeard && view.tutorHeard.length > 0;
  return useHasWaited(isWaiting, ANSWER_PROMPT_AFTER_MS, (view?.studentLines.length ?? 0) + draftEdits);
}

function RunningSession({ session }: { session: Session }) {
  const { seconds, endSession, isEnding, endProblem } = useSessionRun(session);
  const liveVoice = useLiveVoice({ sessionId: session.id });
  const { status, view, voice } = liveVoice;
  const tutorStateLine = useRef<HTMLSpanElement>(null);
  // This changes on every student action, so it is written straight to the page and the session does not render again for it.
  const showTutorState = useCallback((state: string | null) => {
    if (tutorStateLine.current) tutorStateLine.current.textContent = state;
  }, []);
  useOpeningMessage(session, liveVoice.sendTyped);
  const isConnecting = isTutorOnTheWay(status, view);

  const picture = <Board artwork={findArtwork(session.artwork)} note={SESSION_LABELS.boardStandIn} />;
  return (
    <SessionFrame facts={<SessionFacts subject={session.subject} seconds={seconds} tutorStateLine={tutorStateLine} costUsd={view?.costUsd ?? null} />} action={<EndButton isEnding={isEnding} onEnd={() => void endSession()} />} problem={endProblem} isFullHeight>
      <div className="board-stage">
        <div className="board-voice">
          <SessionTitle title={session.title} isQuiet={Boolean(voice) || isConnecting} />
          {!voice && !isConnecting && (
            <div className="label flex items-center gap-2.5">
              <i aria-hidden data-testid="tutor-dot" data-lively={false} className="tutor-dot" />
              <span>{SESSION_LABELS.yourTutor}</span>
            </div>
          )}
          {view?.hasTutorStarted ? (
            <BoardCaption heard={view.tutorHeard} coming={view.tutorComing} firstWord={view.firstWord} />
          ) : (
            <div className="flex flex-1 flex-col justify-end font-voice text-voice">{isConnecting && <p role="status">{VOICE_LABELS.connecting}</p>}</div>
          )}
          <ReplyBox liveVoice={liveVoice} isConnecting={isConnecting} carryOnLine={SESSION_LABELS.carryOnWith(session.title)} />
        </div>
        <ConnectingSaturn isConnecting={isConnecting} />
        {voice ? <LiveBoard voice={voice} isConnecting={isConnecting} onTutorState={showTutorState} visual={getSessionVisual(findArtwork(session.artwork))} onTalk={() => void liveVoice.toggleTalk()} isTalkOn={view?.mic === 'on'} canTalk={!view?.closedBecause} /> : <div className="board-panel">{picture}</div>}
      </div>
    </SessionFrame>
  );
}

// The hidden label holds the button's width, so the bar stays still when the label changes.
function EndButton({ isEnding, onEnd }: { isEnding: boolean; onEnd: () => void }) {
  return (
    <>
      <p role="status" className="sr-only">{isEnding && SESSION_LABELS.ending}</p>
      <button type="button" aria-disabled={isEnding} onClick={onEnd} className={`${BAR_ACTION} inline-grid justify-items-center`}>
        <span aria-hidden className="invisible col-start-1 row-start-1">{SESSION_LABELS.endSession}</span>
        <span className="col-start-1 row-start-1">{isEnding ? SESSION_LABELS.ending : SESSION_LABELS.endSession}</span>
      </button>
    </>
  );
}

function FinishedSession({ session }: { session: Session }) {
  return (
    <SessionFrame
      facts={
        <>
          <SessionFacts subject={session.subject} seconds={session.durationSeconds} />
          <span className="label text-ink-2">{SESSIONS_LABELS.statuses.finished}</span>
        </>
      }
      action={<Link to="/sessions" className={BAR_ACTION}>{SESSION_LABELS.close}</Link>}
    >
      <SessionPanels session={session} tutorWords={SESSION_LABELS.finishedWords} />
    </SessionFrame>
  );
}

// A tester's flag, read at build time, so a build without it holds no cost line at all.
const SessionCost = import.meta.env.VITE_SHOW_COST === '1' ? lazy(() => import('./SessionCost')) : null;

function SessionFacts({ subject, seconds, tutorStateLine, costUsd = null }: { subject: string; seconds: number; tutorStateLine?: RefObject<HTMLSpanElement | null>; costUsd?: number | null }) {
  return (
    <>
      <span className="label min-w-0 wrap-anywhere text-ink-2">{subject}</span>
      <span className="label text-ink-2">{formatSessionLength(seconds)}</span>
      {tutorStateLine && <span ref={tutorStateLine} data-testid="tutor-state" className="label text-ink-2" />}
      {SessionCost && costUsd !== null && (
        <Suspense fallback={null}>
          <SessionCost usd={costUsd} />
        </Suspense>
      )}
    </>
  );
}

interface SessionFrameProps extends PropsWithChildren {
  facts?: ReactNode;
  action?: ReactNode;
  problem?: string | null;
  isFullHeight?: boolean;
}

function SessionFrame({ facts, action, problem, isFullHeight = false, children }: SessionFrameProps) {
  return (
    <div data-page className={`flex animate-arrive flex-col ${isFullHeight ? 'board-session' : 'min-h-dvh px-page-side'}`}>
      <title>{PRODUCT_NAME}</title>
      <header className={`flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line py-2.5 tabular-nums ${isFullHeight ? 'px-6 max-md:px-4' : ''}`}>
        <span className="product-mark">{PRODUCT_NAME}</span>
        {facts}
        <div className="ml-auto flex items-center gap-x-5">
          <ThemeToggle />
          {action}
        </div>
        {problem && <p role="alert" className="w-full text-fine text-ink-2 md:text-right">{problem}</p>}
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

interface SessionPanelsProps {
  session: Session;
  tutorWords: string;
}

function SessionPanels({ session, tutorWords }: SessionPanelsProps) {
  return (
    <div className="grid flex-1 grid-cols-session gap-session py-4 max-md:grid-cols-1">
      <Board artwork={findArtwork(session.artwork)} />
      <div className="flex min-w-0 flex-col gap-3.5">
        <div className="label flex items-center gap-2.5">
          <i aria-hidden data-testid="tutor-dot" className="tutor-dot" />
          <span>{SESSION_LABELS.yourTutor}</span>
        </div>
        <SessionTitle title={session.title} />
        <p className="font-voice text-voice">{tutorWords}</p>
      </div>
    </div>
  );
}

// Focus was on what the student pressed, and that has gone, so it moves to the new screen's heading.
function SessionTitle({ title, isQuiet = false }: { title: string; isQuiet?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  return (
    <h1 ref={heading} tabIndex={-1} className={`font-medium wrap-anywhere text-ink-2 outline-none ${isQuiet ? 'sr-only' : ''}`}>
      {title}
    </h1>
  );
}

function Board({ artwork, note }: { artwork: Artwork | null; note?: string }) {
  return (
    <section className="fades-with-theme flex min-w-0 flex-1 flex-col border border-line bg-panel md:min-h-75">
      <div className="flex min-h-50 flex-1 items-center justify-center p-4">{artwork && <BoardPicture artwork={artwork} />}</div>
      {note && <p className="label border-t border-line px-3 py-1.75 text-ink-2">{note}</p>}
    </section>
  );
}

function getSessionVisual(artwork: Artwork | null) {
  return artwork && <BoardPicture artwork={artwork} />;
}

function BoardPicture({ artwork }: { artwork: Artwork }) {
  if (artwork.kind === 'drawing') return <artwork.Drawing className="block h-auto max-h-board-art w-full" />;
  return <img src={artwork.src} alt={artwork.description} className="block max-h-board-art max-w-full object-contain" />;
}

function getVoiceNote({ status, waitSeconds, view }: LiveVoiceControls, isAnswerDue: boolean): string | null {
  if (view?.closedBecause) return VOICE_LABELS[view.closedBecause];
  if (status === 'overLimit') return VOICE_LABELS.dailyLimit;
  if (status === 'finished') return VOICE_LABELS.sessionFinished;
  if (status === 'tooSoon') return VOICE_LABELS.tooSoon(waitSeconds);
  if (status === 'unavailable' || view?.phase === 'noTutor') return VOICE_LABELS.unavailable;
  if (view?.phase === 'reconnecting') return VOICE_LABELS.reconnecting;
  if (view?.phase === 'ended') return VOICE_LABELS.ended;
  if (view?.phase === 'tutorLost') return VOICE_LABELS.tutorLost;
  if (view?.phase === 'closedForQuiet') return VOICE_LABELS.closedForQuiet;
  if (view?.isQuietWarning) return VOICE_LABELS.quietWarning;
  if (view?.startedFresh) return VOICE_LABELS.startedFresh;
  if (view?.mic === 'denied') return VOICE_LABELS.micDenied;
  if (view?.mic === 'noDevice') return VOICE_LABELS.micNoDevice;
  if (view?.mic === 'failed') return VOICE_LABELS.micFailed;
  if (view?.mic === 'on') return VOICE_LABELS.micOn;
  return isAnswerDue ? VOICE_LABELS.answerPrompt : null;
}

function ReplyBox({ liveVoice, isConnecting, carryOnLine }: { liveVoice: LiveVoiceControls; isConnecting: boolean; carryOnLine: string }) {
  const { status, view, voice, isTalkOn, sendTyped, toggleTalk, openAgain } = liveVoice;
  const isFinished = status === 'finished';
  const isOver = isFinished || status === 'tooSoon' || (view !== null && isVoiceOver(view.phase));
  // A tutor closed for spending is closed for this session too, and another room would only start it over.
  const canOpenAgain = isOver && !isFinished && status !== 'overLimit' && !view?.closedBecause;
  const [reply, setReply] = useState<{ text: string; didFail: boolean } | null>(null);
  const [draftEdits, setDraftEdits] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);
  const isBackWhileConnecting = useHasWaited(isConnecting, REPLY_BOX_BACK_AFTER_MS);
  // A draft keeps its box when the tutor arrives, so nothing typed on a slow connection is lost.
  const isBoxOpen = (!voice && status !== 'connecting') || isBackWhileConnecting || hasDraft;
  if (reply && !reply.didFail && view?.hasTutorStarted) setReply(null);
  if (reply && !reply.didFail && !view?.hasTutorStarted && isOver) setReply({ ...reply, didFail: true });
  const voiceNote = getVoiceNote(liveVoice, useIsAnswerDue(view, draftEdits + (view?.typingNotes ?? 0)));

  async function send(text: string) {
    setHasDraft(false);
    setReply({ text, didFail: false });
    const wasSent = await sendTyped(text);
    if (!wasSent) setReply({ text, didFail: true });
  }

  return (
    <div className="mt-auto flex flex-col gap-3.5">
      <div role="status" className="flex flex-col gap-3.5">
        {view?.mic === 'on' && <StudentCaption lines={view.studentLines} />}
        {reply && (
          <>
            <p className="border-t border-line pt-3 text-sub wrap-anywhere">
              <span className="label block text-ink-2">{SESSION_LABELS.you}</span>
              {reply.text}
            </p>
            <p className="text-fine text-ink-2">{reply.didFail ? SESSION_LABELS.replyNotSent : SESSION_LABELS.replyWaiting}</p>
          </>
        )}
        {voiceNote && <p className="text-fine text-ink-2">{voiceNote}</p>}
      </div>
      {canOpenAgain && (
        <button type="button" onClick={() => void openAgain(carryOnLine)} className="button button-outline self-start">
          {view?.phase === 'closedForQuiet' ? VOICE_LABELS.openAgain : VOICE_LABELS.tryAgain}
        </button>
      )}
      {view?.isQuietWarning && (
        <button type="button" onClick={() => voice?.sayStillHere()} className="button button-outline self-start">
          {VOICE_LABELS.stillHere}
        </button>
      )}
      {view?.isSoundBlocked && !isOver && (
        <button type="button" onClick={() => void voice?.turnOnSound()} className="button button-outline self-start">
          {VOICE_LABELS.tapToHear}
        </button>
      )}
      {isBoxOpen && (
        <div className={isBackWhileConnecting ? 'animate-arrive' : undefined}>
          <ChatBox
            labels={REPLY_BOX_LABELS}
            canAttach={false}
            clearsOnSend
            isSending={isOver}
            takesFocus={isBackWhileConnecting}
            talk={{ isOn: isTalkOn, onToggle: () => void toggleTalk() }}
            onSend={(text) => void send(text)}
            onEdit={(draft) => {
              setDraftEdits((edits) => edits + 1);
              setHasDraft(draft.trim() !== '');
            }}
          />
        </div>
      )}
    </div>
  );
}

function SessionProblem({ message, children }: PropsWithChildren<{ message: string }>) {
  return (
    <SessionFrame>
      <div className="mx-auto flex w-full max-w-column flex-col items-start gap-3 py-page-top">
        <div role="alert">
          <h1 className="text-heading font-semibold">{message}</h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {children}
          <Link to="/sessions" className="button button-outline">{MENU_LABELS.sessions}</Link>
        </div>
      </div>
    </SessionFrame>
  );
}
