import { useState } from 'react';
import { Link } from 'react-router';
import { ChatBox } from '../home/ChatBox';
import { findArtwork } from '../home/artwork';
import { BoardView } from '../lab/BoardView';
import { SceneLayer } from '../scenes/SceneLayer';
import { REPLY_BOX_LABELS, SCENE_LABELS, SESSION_LABELS } from '../strings';
import { BoardPicture, EndButton, SessionFacts, SessionFrame, SessionTitle } from './SessionScreen';
import type { Session } from './sessionQueries';
import { type Lesson, type LessonProblem, useLesson } from './useLesson';
import { useSessionRun } from './useSessionRun';

const EMPTY_BOARD = { elements: new Map(), focus: null, refusedSliders: [] };
function getProblemLabel(problem: LessonProblem): string {
  switch (problem.kind) {
    case 'down': return SCENE_LABELS.lessonDown;
    case 'tooMany': return SCENE_LABELS.tooManyLessons;
    case 'twoOpen': return SCENE_LABELS.twoLessonsOpen;
    case 'tooManyStarts': return SCENE_LABELS.tooManyStarts(problem.retryAfterSeconds);
    case 'studentSpent': return SCENE_LABELS.studentSpent(problem.retryAfterSeconds);
    case 'everyoneSpent': return SCENE_LABELS.everyoneSpent(problem.retryAfterSeconds);
    case 'moved': return SCENE_LABELS.lessonMoved;
    case 'lost': return SCENE_LABELS.lessonLost;
    case 'ended': return SCENE_LABELS.lessonEnded;
    case 'silent': return SCENE_LABELS.lessonSilent;
  }
}

function LessonBoard({ session, lesson: { frame, stage, onStageContainer } }: { session: Session; lesson: Lesson }) {
  const artwork = findArtwork(session.artwork);
  return (
    <section className="fades-with-theme relative flex min-w-0 flex-col overflow-hidden border border-line bg-panel md:min-h-75">
      {frame ? <BoardView board={frame.board} atMs={frame.atMs} /> : <div className="flex min-h-50 flex-1 items-center justify-center p-4">{artwork && <BoardPicture artwork={artwork} />}</div>}
      <SceneLayer board={frame?.board ?? EMPTY_BOARD} atMs={frame?.atMs ?? 0} stage={stage} onContainer={onStageContainer} />
    </section>
  );
}

function LessonNotice({ problem, onTryAgain }: { problem: LessonProblem; onTryAgain: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2">
      <p className="font-voice text-lead">{getProblemLabel(problem)}</p>
      <button type="button" className="button button-outline px-3 py-1.25" onClick={onTryAgain}>{SCENE_LABELS.tryAgain}</button>
    </div>
  );
}

function LessonReplyBox({ onReply }: { onReply: () => void }) {
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
            <p className="font-voice text-lead">{SCENE_LABELS.answerStandIn}</p>
          </>
        )}
      </div>
      <ChatBox labels={REPLY_BOX_LABELS} canAttach={false} clearsOnSend onSend={(text) => { setReply(text); onReply(); }} onEdit={() => undefined} />
    </div>
  );
}

export default function LessonSession({ session }: { session: Session }) {
  const { seconds, endSession, isEnding, endProblem } = useSessionRun(session);
  const lesson = useLesson(session);

  return (
    <SessionFrame facts={<SessionFacts subject={session.subject} seconds={seconds} />} action={<EndButton isEnding={isEnding} onEnd={() => void endSession()} />} problem={endProblem}>
      <div className="grid flex-1 grid-cols-session gap-session py-4 max-md:grid-cols-1">
        <LessonBoard session={session} lesson={lesson} />
        <div className="flex min-w-0 flex-col gap-3.5">
          <div className="label flex items-center gap-2.5">
            <i aria-hidden className="tutor-dot" />
            <span>{SESSION_LABELS.yourTutor}</span>
          </div>
          <SessionTitle title={session.title} />
          <p data-testid="caption" className="font-voice text-voice">{lesson.frame?.caption}</p>
          {lesson.problem && <LessonNotice problem={lesson.problem} onTryAgain={lesson.tryAgain} />}
          {lesson.frame?.caption && <p className="label text-ink-2">{SCENE_LABELS.wordsNotChecked}</p>}
          {lesson.isVoiceAtLimit && <p role="status" className="label text-ink-2">{SCENE_LABELS.voiceAtLimit}</p>}
          {lesson.hasNoLesson ? <Link to="/" className="button button-outline self-start px-3 py-1.25">{SCENE_LABELS.backToHome}</Link> : <LessonReplyBox onReply={lesson.interrupt} />}
        </div>
      </div>
    </SessionFrame>
  );
}
