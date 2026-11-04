import { type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ChatBox } from '../home/ChatBox';
import { findArtwork, type Artwork } from '../home/artwork';
import { RecapLines } from '../replay/RecapLines';
import { ReplayScreen } from '../replay/ReplayScreen';
import { API_ERROR_LABELS, MENU_LABELS, RECAP_LABELS, REPLY_BOX_LABELS, SESSION_LABELS, SESSIONS_LABELS, VOICE_LABELS } from '../strings';
import { BoardPicture, getSessionVisual } from './BoardPicture';
import { type Session, useSession } from './sessionQueries';
import { BAR_ACTION, SessionFacts, SessionFrame, SessionTitle } from './SessionFrame';
import { useSessionRun } from './useSessionRun';
import { StudentCaption } from '../voice/Captions';
import { BoardCaption } from '../board/BoardCaption';
import { LiveBoard } from '../voice/LiveBoard';
import { isVoiceOver, type LiveVoiceView } from '../voice/liveVoice';
import { ConnectingSaturn } from './ConnectingSaturn';
import { type LiveVoiceControls, useLiveVoice } from '../voice/useLiveVoice';

const NOT_FOUND_STATUS = 404;
const BAD_ID_STATUS = 400;
/** The tutor has this long from the press of End to say whether there is a recap, and past it the student leaves anyway. */
const LONGEST_RECAP_WAIT_MS = 8000;

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
  if (!wasFinishedOnOpening) return <RunningSession session={session} />;
  return session.canReplay ? <ReplayScreen session={session} /> : <FinishedSession session={session} />;
}

// Every session speaks first, so a student is never left waiting on a blank screen. Sending this opens the room.
export function getOpeningMessage({ title, subject, durationSeconds }: Pick<Session, 'title' | 'subject' | 'durationSeconds'>): string {
  if (durationSeconds > 0) return SESSION_LABELS.carryOnWith(title);
  return subject === SESSION_LABELS.questionSubject ? title : SESSION_LABELS.askAboutTopic(title);
}

// React runs effects twice in development, and the room must open once, so this waits for the first run to settle.
function useOpeningMessage(session: Session, sendTyped: (text: string, isOpening: boolean) => Promise<boolean>) {
  const [opening] = useState(() => getOpeningMessage(session));
  const hasSent = useRef(false);

  useEffect(() => {
    const sending = setTimeout(() => {
      if (hasSent.current) return;
      hasSent.current = true;
      void sendTyped(opening, true);
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

function useIsAnswerDue(view: LiveVoiceView | null, draftEdits: number): boolean {
  const isWaiting = view !== null && view.phase === 'live' && view.mic === 'off' && !view.closedBecause && !view.isTutorSpeaking && !view.isThinking && !view.isHeard && view.tutorHeard.length > 0;
  return useHasWaited(isWaiting, ANSWER_PROMPT_AFTER_MS, (view?.studentLines.length ?? 0) + draftEdits);
}

// A student with no recap coming, or one that never comes, leaves as they would have with none.
function useLeaveWhenNoRecap({ isEnding, isRecapping, view, leave }: { isEnding: boolean; isRecapping: boolean; view: LiveVoiceView | null; leave(): Promise<void> }) {
  const hasWaitedTooLong = useHasWaited(isEnding && !view?.isRecapDecided, LONGEST_RECAP_WAIT_MS);
  const hasNothingToSay = view?.isRecapDecided === true && view.recap === null;
  const shouldLeave = isRecapping && (hasWaitedTooLong || hasNothingToSay);
  const leaving = useRef(false);
  useEffect(() => {
    if (!shouldLeave || leaving.current) return;
    leaving.current = true;
    void leave();
  }, [shouldLeave, leave]);
}

function RunningSession({ session }: { session: Session }) {
  const liveVoice = useLiveVoice({ sessionId: session.id });
  const { status, view, voice } = liveVoice;
  const { seconds, endSession, leave, isEnding, isRecapping, endProblem } = useSessionRun(session, { canAsk: () => voice?.canAskForRecap() ?? false, ask: () => voice?.askForRecap() ?? false });
  useLeaveWhenNoRecap({ isEnding, isRecapping, view, leave });
  const tutorStateLine = useRef<HTMLSpanElement>(null);
  // This changes on every student action, so it is written straight to the page and the session does not render again for it.
  const showTutorState = useCallback((state: string | null) => {
    if (tutorStateLine.current) tutorStateLine.current.textContent = state;
  }, []);
  useOpeningMessage(session, liveVoice.sendTyped);
  const isConnecting = isTutorOnTheWay(status, view);

  const picture = <Board artwork={findArtwork(session.artwork)} note={SESSION_LABELS.boardStandIn} />;
  return (
    <SessionFrame facts={<SessionFacts subject={session.subject} seconds={seconds} tutorStateLine={tutorStateLine} costUsd={view?.costUsd ?? null} />} action={isRecapping ? <button type="button" onClick={() => void leave()} className={BAR_ACTION}>{SESSION_LABELS.close}</button> : <EndButton isEnding={isEnding} onEnd={() => void endSession()} />} problem={endProblem} isFullHeight>
      <div className="board-stage">
        <div className={`board-voice ${isRecapping ? 'board-voice-reading' : ''}`}>
          <SessionTitle title={session.title} isQuiet={Boolean(voice) || isConnecting} />
          {!voice && !isConnecting && (
            <div className="label flex items-center gap-2.5">
              <i aria-hidden data-testid="tutor-dot" data-lively={false} className="tutor-dot" />
              <span>{SESSION_LABELS.yourTutor}</span>
            </div>
          )}
          {isRecapping ? (
            <div className="flex flex-1 flex-col justify-end">
              {view?.recap ? <RecapLines recap={view.recap} sessionId={session.id} /> : <p role="status" data-utterance-now className="font-voice text-voice">{RECAP_LABELS.writing}</p>}
            </div>
          ) : (
            <>
              {view?.hasTutorStarted ? (
                <BoardCaption heard={view.tutorHeard} coming={view.tutorComing} firstWord={view.firstWord} />
              ) : (
                <div className="flex flex-1 flex-col justify-end font-voice text-voice">{isConnecting && <p role="status">{VOICE_LABELS.connecting}</p>}</div>
              )}
              <ReplyBox liveVoice={liveVoice} isConnecting={isConnecting} carryOnLine={SESSION_LABELS.carryOnWith(session.title)} />
            </>
          )}
        </div>
        <ConnectingSaturn isConnecting={isConnecting} />
        {voice ? <LiveBoard voice={voice} isConnecting={isConnecting} onTutorState={showTutorState} visual={getSessionVisual(findArtwork(session.artwork))} onTalk={() => void liveVoice.toggleTalk()} isTalkOn={view?.mic === 'on'} canTalk={!view?.closedBecause} isLookingBack={isRecapping} /> : <div className="board-panel">{picture}</div>}
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

function Board({ artwork, note }: { artwork: Artwork | null; note?: string }) {
  return (
    <section className="fades-with-theme flex min-w-0 flex-1 flex-col border border-line bg-panel md:min-h-75">
      <div className="flex min-h-50 flex-1 items-center justify-center p-4">{artwork && <BoardPicture artwork={artwork} />}</div>
      {note && <p className="label border-t border-line px-3 py-1.75 text-ink-2">{note}</p>}
    </section>
  );
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
  const isBoxOpen = (!voice && status !== 'connecting') || isBackWhileConnecting || hasDraft;
  if (reply && view?.hasTutorStarted && (!reply.didFail || (!isOver && !view.closedBecause))) setReply(null);
  if (reply && !reply.didFail && !view?.hasTutorStarted && isOver) setReply({ ...reply, didFail: true });
  const voiceNote = getVoiceNote(liveVoice, useIsAnswerDue(view, draftEdits + (view?.typingNoteCount ?? 0)));

  async function send(text: string) {
    setHasDraft(false);
    setReply(isConnecting ? { text, didFail: false } : null);
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
