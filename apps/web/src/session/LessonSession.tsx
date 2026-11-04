import { findArtwork } from '../home/artwork';
import { BoardView } from '../lab/BoardView';
import { SceneLayer } from '../scenes/SceneLayer';
import { SCENE_LABELS, SESSION_LABELS } from '../strings';
import { BoardPicture, EndButton, ReplyBox, SessionFacts, SessionFrame, SessionTitle } from './SessionScreen';
import type { Session } from './sessionQueries';
import { type Lesson, type LessonProblem, useLesson } from './useLesson';
import { useSessionRun } from './useSessionRun';

const EMPTY_BOARD = { elements: new Map(), focus: null };
const PROBLEM_LABELS: Record<LessonProblem, string> = {
  down: SCENE_LABELS.lessonDown,
  tooMany: SCENE_LABELS.tooManyLessons,
  moved: SCENE_LABELS.lessonMoved,
  lost: SCENE_LABELS.lessonLost,
  ended: SCENE_LABELS.lessonEnded,
  silent: SCENE_LABELS.lessonSilent,
};

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
      <p className="font-voice text-lead">{PROBLEM_LABELS[problem]}</p>
      <button type="button" className="button button-outline px-3 py-1.25" onClick={onTryAgain}>{SCENE_LABELS.tryAgain}</button>
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
          <ReplyBox answer={SCENE_LABELS.answerStandIn} onReply={lesson.interrupt} />
        </div>
      </div>
    </SessionFrame>
  );
}
