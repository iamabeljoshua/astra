import { type BoardState } from '@astra/board';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { ChatBox } from '../home/ChatBox';
import { BoardView } from '../lab/BoardView';
import { REPLY_BOX_LABELS, SESSION_LABELS } from '../strings';
import type { Session } from './sessionQueries';
import { joinTutorRoom, type TutorRoom } from './tutorRoom';

const TUTOR_JOIN_LIMIT_MS = 12_000;

type RoomState = { kind: 'joining' } | { kind: 'noTutor' } | { kind: 'here'; room: TutorRoom };

/** What the student asked for, sent once as a new session opens, so the tutor starts on it without being asked twice. */
export function getOpeningMessage(session: Pick<Session, 'title' | 'subject' | 'durationSeconds'>): string | null {
  if (session.durationSeconds > 0) return null;
  return session.subject === SESSION_LABELS.questionSubject ? session.title : SESSION_LABELS.askAboutTopic(session.title);
}

// The room belongs to the session's id, because the session object changes every time its length is saved.
function useTutorRoom(session: Session): RoomState {
  const [state, setState] = useState<RoomState>({ kind: 'joining' });
  const [opening] = useState(() => getOpeningMessage(session));
  const sessionId = session.id;

  useEffect(() => {
    let isGone = false;
    let joined: TutorRoom | null = null;
    let tutorIsHere = false;
    const signal = new AbortController();
    const showNoTutor = () => {
      if (!isGone) setState({ kind: 'noTutor' });
    };
    async function join() {
      const { url, token } = await api.post('/sessions/{id}/live', { signal: signal.signal, params: { path: { id: sessionId } } });
      const bench = import.meta.env.DEV ? (await import('../lab/lessonBench')).createLessonBench() : undefined;
      const room = await joinTutorRoom({
        url,
        token,
        bench,
        onTutorHere() {
          tutorIsHere = true;
          if (opening && !isGone) joined?.sendTyped(opening);
        },
      });
      joined = room;
      if (isGone) return void room.close();
      setState({ kind: 'here', room });
    }
    // React runs effects twice in development, and two joins under one identity would throw each other out.
    const starting = setTimeout(() => void join().catch(showNoTutor));
    const giveUp = setTimeout(() => {
      if (!tutorIsHere) showNoTutor();
    }, TUTOR_JOIN_LIMIT_MS);
    return () => {
      isGone = true;
      clearTimeout(starting);
      clearTimeout(giveUp);
      signal.abort();
      void joined?.close();
    };
  }, [sessionId, opening]);

  return state;
}

function LiveBoard({ room }: { room: TutorRoom | null }) {
  const [frame, setFrame] = useState<{ board: BoardState; atMs: number }>({ board: { elements: new Map(), focus: null }, atMs: 0 });

  useEffect(() => {
    if (!room) return;
    let animationFrame = requestAnimationFrame(function draw() {
      animationFrame = requestAnimationFrame(draw);
      setFrame(room.getBoardNow());
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [room]);

  return <BoardView board={frame.board} atMs={frame.atMs} />;
}

const POLL_MS = 80;

function useTutorVoice(room: TutorRoom | null) {
  const [voice, setVoice] = useState({ caption: '', isActive: false, needsSound: false });

  useEffect(() => {
    if (!room) return;
    const poller = setInterval(() => {
      setVoice((last) => {
        // A finished turn's words stay until the next turn starts, so a student can still read them.
        const next = { caption: room.getCaption() || last.caption, isActive: room.getIsActive(), needsSound: !room.getIsAudioRunning() };
        return last.caption === next.caption && last.isActive === next.isActive && last.needsSound === next.needsSound ? last : next;
      });
    }, POLL_MS);
    return () => clearInterval(poller);
  }, [room]);

  return voice;
}

// The live screen: the board on one side, and the tutor's words and the reply box on the other, on the session's usual grid.
export default function LiveLesson({ session }: { session: Session }) {
  const state = useTutorRoom(session);
  const room = state.kind === 'here' ? state.room : null;
  const { caption, isActive, needsSound } = useTutorVoice(room);
  const [studentWords, setStudentWords] = useState<string | null>(getOpeningMessage(session) && session.subject === SESSION_LABELS.questionSubject ? session.title : null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  const send = (text: string) => {
    room?.sendTyped(text);
    setStudentWords(text);
  };

  return (
    <div className="grid flex-1 grid-cols-session gap-session py-4 max-md:grid-cols-1">
      <section aria-label={SESSION_LABELS.liveBoard} className="fades-with-theme flex min-w-0 flex-col max-md:h-[60svh] md:min-h-75">
        <LiveBoard room={room} />
      </section>
      <div className="flex min-w-0 flex-col gap-3.5">
        <div className="label flex items-center gap-2.5">
          <i aria-hidden className={`tutor-dot ${isActive ? 'animate-speak motion-reduce:animate-none' : ''}`} data-testid="tutor-dot" />
          <span>{SESSION_LABELS.yourTutor}</span>
        </div>
        <h1 ref={heading} tabIndex={-1} className="font-medium wrap-anywhere text-ink-2 outline-none">
          {session.title}
        </h1>
        <p role="log" aria-live="polite" data-testid="tutor-words" className="font-voice text-voice wrap-anywhere">
          {state.kind === 'noTutor' ? SESSION_LABELS.noTutor : caption || (state.kind === 'joining' ? SESSION_LABELS.connecting : '')}
        </p>
        {needsSound && (
          <button type="button" className="button button-outline self-start" onClick={() => void room?.startAudio()}>
            {SESSION_LABELS.turnOnSound}
          </button>
        )}
        <div className="mt-auto flex flex-col gap-3.5">
          {studentWords && (
            <p className="border-t border-line pt-3 text-sub wrap-anywhere">
              <span className="label block text-ink-2">{SESSION_LABELS.you}</span>
              {studentWords}
            </p>
          )}
          <ChatBox labels={REPLY_BOX_LABELS} canAttach={false} clearsOnSend onSend={send} onEdit={() => undefined} />
        </div>
      </div>
    </div>
  );
}
