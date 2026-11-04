import { type PropsWithChildren, type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ChatBox } from '../home/ChatBox';
import { findArtwork, type Artwork } from '../home/artwork';
import { API_ERROR_LABELS, MENU_LABELS, PRODUCT_NAME, REPLY_BOX_LABELS, SESSION_LABELS, SESSIONS_LABELS, VOICE_LABELS } from '../strings';
import { ThemeToggle } from '../theme/ThemeToggle';
import { formatSessionLength } from './formatSession';
import { type Session, useSession } from './sessionQueries';
import { useSessionRun } from './useSessionRun';
import { StudentCaption, TutorCaption } from '../voice/Captions';
import { LiveBoard } from '../voice/LiveBoard';
import { isVoiceOver, type LiveVoice, type LiveVoiceView } from '../voice/liveVoice';
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

export function getOpeningMessage({ title, subject, durationSeconds }: Pick<Session, 'title' | 'subject' | 'durationSeconds'>): string | null {
  if (durationSeconds > 0) return null;
  return subject === SESSION_LABELS.questionSubject ? title : SESSION_LABELS.askAboutTopic(title);
}

// React runs effects twice in development, and the room must open once, so this waits for the first run to settle.
function useOpeningMessage(session: Session, sendTyped: (text: string) => Promise<boolean>) {
  const [opening] = useState(() => getOpeningMessage(session));
  const hasSent = useRef(false);

  useEffect(() => {
    if (!opening) return;
    const sending = setTimeout(() => {
      if (hasSent.current) return;
      hasSent.current = true;
      void sendTyped(opening);
    });
    return () => clearTimeout(sending);
  }, [opening, sendTyped]);

  return opening;
}

function RunningSession({ session }: { session: Session }) {
  const { seconds, endSession, isEnding, endProblem } = useSessionRun(session);
  const liveVoice = useLiveVoice({ sessionId: session.id });
  const { view, voice } = liveVoice;
  const opening = useOpeningMessage(session, liveVoice.sendTyped);
  const { warm } = liveVoice;
  // A new session warmed its room when it was made, and one continued from Home has none yet.
  useEffect(() => {
    if (!opening) warm();
  }, [opening, warm]);
  const idleWords = liveVoice.status === 'idle' && !opening ? SESSION_LABELS.idleWords : null;

  return (
    <SessionFrame
      facts={<SessionFacts subject={session.subject} seconds={seconds} />}
      action={<EndButton isEnding={isEnding} onEnd={() => void endSession()} />}
      problem={endProblem}
    >
      <SessionPanels
        session={session}
        tutorWords={idleWords}
        tutorCaption={view && <TutorCaption heard={view.tutorHeard} coming={view.tutorComing} />}
        isDotLively={view !== null && !view.closedBecause && (view.isTutorSpeaking || view.isHeard || view.isThinking)}
        boardNote={SESSION_LABELS.boardStandIn}
        liveVoice={voice}
      >
        <ReplyBox liveVoice={liveVoice} />
      </SessionPanels>
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

function SessionFacts({ subject, seconds }: { subject: string; seconds: number }) {
  return (
    <>
      <span className="label min-w-0 wrap-anywhere text-ink-2">{subject}</span>
      <span className="label text-ink-2">{formatSessionLength(seconds)}</span>
    </>
  );
}

interface SessionFrameProps extends PropsWithChildren {
  facts?: ReactNode;
  action?: ReactNode;
  problem?: string | null;
}

function SessionFrame({ facts, action, problem, children }: SessionFrameProps) {
  return (
    <div data-page className="flex min-h-dvh animate-arrive flex-col px-page-side">
      <title>{PRODUCT_NAME}</title>
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line py-2.5 tabular-nums">
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

interface SessionPanelsProps extends PropsWithChildren {
  session: Session;
  tutorWords: string | null;
  tutorCaption?: ReactNode;
  isDotLively?: boolean;
  boardNote?: string;
  liveVoice?: LiveVoice | null;
}

function SessionPanels({ session, tutorWords, tutorCaption, isDotLively = false, boardNote, liveVoice, children }: SessionPanelsProps) {
  const picture = <Board artwork={findArtwork(session.artwork)} note={boardNote} />;
  return (
    <div className="grid flex-1 grid-cols-session gap-session py-4 max-md:grid-cols-1">
      {liveVoice ? <LiveBoard voice={liveVoice} whileEmpty={picture} /> : picture}
      <div className="flex min-w-0 flex-col gap-3.5">
        <div className="label flex items-center gap-2.5">
          <i aria-hidden data-testid="tutor-dot" data-lively={isDotLively} className={`tutor-dot ${isDotLively ? 'motion-safe:animate-speak' : ''}`} />
          <span>{SESSION_LABELS.yourTutor}</span>
        </div>
        <SessionTitle title={session.title} />
        {tutorCaption ?? (tutorWords && <p className="font-voice text-voice">{tutorWords}</p>)}
        {children}
      </div>
    </div>
  );
}

// Focus was on what the student pressed, and that has gone, so it moves to the new screen's heading.
function SessionTitle({ title }: { title: string }) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  return (
    <h1 ref={heading} tabIndex={-1} className="font-medium wrap-anywhere text-ink-2 outline-none">
      {title}
    </h1>
  );
}

function Board({ artwork, note }: { artwork: Artwork | null; note?: string }) {
  return (
    <section className="fades-with-theme flex min-w-0 flex-col border border-line bg-panel md:min-h-75">
      <div className="flex min-h-50 flex-1 items-center justify-center p-4">{artwork && <BoardPicture artwork={artwork} />}</div>
      {note && <p className="label border-t border-line px-3 py-1.75 text-ink-2">{note}</p>}
    </section>
  );
}

function BoardPicture({ artwork }: { artwork: Artwork }) {
  if (artwork.kind === 'drawing') return <artwork.Drawing className="block h-auto max-h-board-art w-full" />;
  return <img src={artwork.src} alt={artwork.description} className="block max-h-board-art max-w-full object-contain" />;
}

function getVoiceNote(status: LiveVoiceControls['status'], view: LiveVoiceView | null): string | null {
  if (view?.closedBecause) return VOICE_LABELS[view.closedBecause];
  if (status === 'overLimit') return VOICE_LABELS.dailyLimit;
  if (status === 'finished') return VOICE_LABELS.sessionFinished;
  if (status === 'connecting' || view?.phase === 'connecting') return VOICE_LABELS.connecting;
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
  return null;
}

function ReplyBox({ liveVoice }: { liveVoice: LiveVoiceControls }) {
  const { status, view, voice, isTalkOn, sendTyped, toggleTalk, openAgain } = liveVoice;
  const isFinished = status === 'finished';
  const isOver = isFinished || (view !== null && isVoiceOver(view.phase));
  // A tutor closed for spending is closed for this session too, and another room would only start it over.
  const canOpenAgain = isOver && !isFinished && status !== 'overLimit' && !view?.closedBecause;
  const [replyWithNoRoom, setReplyWithNoRoom] = useState<string | null>(null);
  const voiceNote = getVoiceNote(status, view);

  async function send(text: string) {
    const wasSent = await sendTyped(text);
    setReplyWithNoRoom(wasSent ? null : text);
  }

  return (
    <div className="mt-auto flex flex-col gap-3.5">
      <div role="status" className="flex flex-col gap-3.5">
        {view && <StudentCaption lines={view.studentLines} />}
        {replyWithNoRoom && (
          <>
            <p className="border-t border-line pt-3 text-sub wrap-anywhere">
              <span className="label block text-ink-2">{SESSION_LABELS.you}</span>
              {replyWithNoRoom}
            </p>
            <p className="text-fine text-ink-2">{SESSION_LABELS.replyNotSent}</p>
          </>
        )}
        {voiceNote && <p className="text-fine text-ink-2">{voiceNote}</p>}
      </div>
      {canOpenAgain && (
        <button type="button" onClick={() => void openAgain()} className="button button-outline self-start">
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
          {VOICE_LABELS.turnOnSound}
        </button>
      )}
      <ChatBox labels={REPLY_BOX_LABELS} canAttach={false} clearsOnSend isSending={isOver} talk={{ isOn: isTalkOn, onToggle: () => void toggleTalk() }} onSend={(text) => void send(text)} onEdit={() => undefined} />
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
