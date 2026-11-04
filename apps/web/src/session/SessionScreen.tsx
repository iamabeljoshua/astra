import { lazy, type PropsWithChildren, type ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ChatBox } from '../home/ChatBox';
import { findArtwork, type Artwork } from '../home/artwork';
import { API_ERROR_LABELS, MENU_LABELS, PRODUCT_NAME, REPLY_BOX_LABELS, SESSION_LABELS, SESSIONS_LABELS } from '../strings';
import { ThemeToggle } from '../theme/ThemeToggle';
import { formatSessionLength } from './formatSession';
import { type Session, useSession } from './sessionQueries';
import { useSessionRun } from './useSessionRun';

// Off by default until M3.10 replaces the stand-in, because a lesson needs the agent and a room server running beside the app.
const LiveLesson = import.meta.env.VITE_LIVE_TUTOR === '1' ? lazy(() => import('./LiveLesson')) : null;

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

function RunningSession({ session }: { session: Session }) {
  const { seconds, endSession, isEnding, endProblem } = useSessionRun(session);

  return (
    <SessionFrame
      facts={<SessionFacts subject={session.subject} seconds={seconds} />}
      action={<EndButton isEnding={isEnding} onEnd={() => void endSession()} />}
      problem={endProblem}
    >
      {LiveLesson ? (
        <Suspense fallback={<p role="status" className="sr-only">{SESSION_LABELS.loading}</p>}>
          <LiveLesson session={session} />
        </Suspense>
      ) : (
        <SessionPanels session={session} tutorWords={SESSION_LABELS.standInWords} boardNote={SESSION_LABELS.boardStandIn}>
          <ReplyBox />
        </SessionPanels>
      )}
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
  tutorWords: string;
  boardNote?: string;
}

function SessionPanels({ session, tutorWords, boardNote, children }: SessionPanelsProps) {
  return (
    <div className="grid flex-1 grid-cols-session gap-session py-4 max-md:grid-cols-1">
      <Board artwork={findArtwork(session.artwork)} note={boardNote} />
      <div className="flex min-w-0 flex-col gap-3.5">
        <div className="label flex items-center gap-2.5">
          <i aria-hidden className="tutor-dot" />
          <span>{SESSION_LABELS.yourTutor}</span>
        </div>
        <SessionTitle title={session.title} />
        <p className="font-voice text-voice">{tutorWords}</p>
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

function ReplyBox() {
  const [reply, setReply] = useState<string | null>(null);

  return (
    <div className="mt-auto flex flex-col gap-3.5">
      <div role="status" className="flex flex-col gap-3.5">
        {reply && (
          <>
            <p className="border-t border-line pt-3 text-sub wrap-anywhere">
              <span className="label block text-ink-2">{SESSION_LABELS.you}</span>
              {reply}
            </p>
            <p className="font-voice text-lead">{SESSION_LABELS.standInAnswer}</p>
          </>
        )}
      </div>
      <ChatBox labels={REPLY_BOX_LABELS} canAttach={false} clearsOnSend onSend={setReply} onEdit={() => undefined} />
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
