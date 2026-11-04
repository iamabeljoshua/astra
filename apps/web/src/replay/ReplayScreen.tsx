import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CaptionLines } from '../board/BoardCaption';
import type { VisualPeek } from '../board/boardStage';
import { BoardStageView } from '../board/BoardStageView';
import { MovingDot } from '../board/MovingDot';
import { SharedBoard } from '../board/SharedBoard';
import { useDotTarget } from '../board/useDotTarget';
import { findArtwork } from '../home/artwork';
import { getSessionVisual } from '../session/BoardPicture';
import type { Session } from '../session/sessionQueries';
import { BAR_ACTION, SessionFacts, SessionFrame, SessionTitle } from '../session/SessionFrame';
import { API_ERROR_LABELS, MENU_LABELS, REPLAY_LABELS, SESSION_LABELS, VOICE_LABELS } from '../strings';
import { formatSessionLength } from '../session/formatSession';
import { RecapLines } from './RecapLines';
import { REPLAY_SPEEDS } from './replayClock';
import { getReplayBoard, getReplayCaption, getReplayStudentLine, type ReplayLesson } from './replayLesson';
import { type SavedReplay, useDeleteReplay, useReplay } from './replayQueries';
import { type ReplayPlayer, useReplayPlayer } from './useReplayPlayer';

const MS_PER_SECOND = 1000;
const NO_LOUDNESS = () => 0;

const getPercent = (atMs: number, durationMs: number) => `${durationMs > 0 ? (atMs / durationMs) * 100 : 0}%`;

const toSeconds = (ms: number) => Math.floor(ms / MS_PER_SECOND);

export function ReplayScreen({ session }: { session: Session }) {
  const replay = useReplay(session.id);
  const action = <Link to="/sessions" className={BAR_ACTION}>{SESSION_LABELS.close}</Link>;
  const facts = (
    <>
      <SessionFacts subject={session.subject} seconds={session.durationSeconds} />
      <span className="label text-ink-2">{REPLAY_LABELS.status}</span>
    </>
  );
  const hasLesson = replay.data && replay.data.lesson.runs.length > 0;
  return (
    <SessionFrame facts={facts} action={action} isFullHeight={Boolean(hasLesson)}>
      {hasLesson ? <PlayingReplay session={session} saved={replay.data as SavedReplay} /> : <ReplayNote session={session} message={replay.data ? REPLAY_LABELS.noneLeft : replay.error ? REPLAY_LABELS.couldNotLoad : null} />}
    </SessionFrame>
  );
}

function ReplayNote({ session, message }: { session: Session; message: string | null }) {
  if (!message) return <p role="status" className="sr-only">{SESSION_LABELS.loading}</p>;
  return (
    <div className="mx-auto flex w-full max-w-column flex-col items-start gap-3 py-page-top">
      <SessionTitle title={session.title} />
      <p role="alert" className="font-voice text-voice">{message}</p>
      <Link to="/sessions" className="button button-outline">{MENU_LABELS.sessions}</Link>
    </div>
  );
}

function useSpaceToPlay(togglePlay: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== ' ' || (event.target as Element | null)?.closest('button, input, a, textarea')) return;
      event.preventDefault();
      togglePlay();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [togglePlay]);
}

function PlayingReplay({ session, saved: { lesson, recap } }: { session: Session; saved: SavedReplay }) {
  const player = useReplayPlayer(lesson);
  const { atMs, isPlaying, togglePlay } = player;
  const { board, atMs: boardAtMs } = useMemo(() => getReplayBoard(lesson, atMs), [lesson, atMs]);
  const caption = useMemo(() => getReplayCaption(lesson, atMs), [lesson, atMs]);
  const studentLine = getReplayStudentLine(lesson, atMs);
  const { target } = useDotTarget(board, caption.isSpeaking);
  const [peek, setPeek] = useState<VisualPeek | null>(null);
  useSpaceToPlay(togglePlay);
  const isAtRest = !isPlaying && (atMs === 0 || atMs >= lesson.durationMs);

  return (
    <div className="board-stage">
      <div className="board-voice">
        <SessionTitle title={session.title} />
        {isAtRest && recap ? <div className="flex flex-1 flex-col justify-end"><RecapLines recap={recap} /></div> : <CaptionLines past={caption.past} heard={caption.heard} coming={caption.coming} />}
        {studentLine && !isAtRest && (
          <p data-testid="replay-student-line" className="border-t border-line pt-3 text-sub wrap-anywhere">
            <span className="label block text-ink-2">{REPLAY_LABELS.you}</span>
            {studentLine}
          </p>
        )}
        <p data-testid="replay-sound-note" className="text-fine text-ink-2">{!player.canSpeak ? REPLAY_LABELS.noSoundNote : player.isSoundOn ? REPLAY_LABELS.soundNote : REPLAY_LABELS.soundOffNote}</p>
        <DeleteReplay sessionId={session.id} />
      </div>
      <BoardStageView stage={board.stage} atMs={boardAtMs} visual={getSessionVisual(findArtwork(session.artwork))} ariaLabel={VOICE_LABELS.board} peek={peek} onPeek={setPeek} footer={<ReplayTransport lesson={lesson} player={player} onSeeked={() => setPeek(null)} />}>
        <MovingDot rowId={target.rowId} isWatching={target.isWatching} isThinking={false} isLively={caption.isSpeaking} getLoudness={NO_LOUDNESS} />
        <SharedBoard board={board} atMs={boardAtMs} />
      </BoardStageView>
    </div>
  );
}

function ReplayTransport({ lesson, player, onSeeked }: { lesson: ReplayLesson; player: ReplayPlayer; onSeeked(): void }) {
  const { atMs, isPlaying, speed, isSoundOn, canSpeak, togglePlay, seek, setSpeed, toggleSound } = player;
  return (
    <div className="board-tools replay-transport" data-testid="replay-transport">
      <button type="button" className="board-tool-main replay-play" onClick={togglePlay}>{isPlaying ? REPLAY_LABELS.pause : REPLAY_LABELS.play}</button>
      <div className="replay-scrub">
        <i aria-hidden className="replay-scrub-done" style={{ width: getPercent(atMs, lesson.durationMs) }} />
        {lesson.moments.map((moment) => <i aria-hidden key={moment} className="replay-scrub-moment" style={{ left: getPercent(moment, lesson.durationMs) }} />)}
        <input
          type="range"
          aria-label={REPLAY_LABELS.timeline}
          aria-valuetext={formatSessionLength(toSeconds(atMs))}
          min={0}
          max={lesson.durationMs}
          value={atMs}
          onChange={(event) => {
            seek(Number(event.target.value));
            onSeeked();
          }}
        />
      </div>
      <span data-testid="replay-time" className="label whitespace-nowrap text-ink-2 tabular-nums">{formatSessionLength(toSeconds(atMs))} / {formatSessionLength(toSeconds(lesson.durationMs))}</span>
      <div role="group" aria-label={REPLAY_LABELS.speed} className="flex gap-1">
        {REPLAY_SPEEDS.map((option) => <button key={option} type="button" className="board-tool" aria-pressed={speed === option} onClick={() => setSpeed(option)}>{REPLAY_LABELS.speedLabel(option)}</button>)}
      </div>
      {canSpeak && <button type="button" className="board-tool" aria-pressed={isSoundOn} onClick={toggleSound}>{REPLAY_LABELS.sound}</button>}
    </div>
  );
}

function DeleteReplay({ sessionId }: { sessionId: string }) {
  const [isAsking, setIsAsking] = useState(false);
  const remove = useDeleteReplay(sessionId);
  const navigate = useNavigate();
  if (!isAsking) return <button type="button" className="self-start text-fine text-ink-2 underline underline-offset-3" onClick={() => setIsAsking(true)}>{REPLAY_LABELS.deleteReplay}</button>;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <p className="text-fine">{REPLAY_LABELS.deleteQuestion}</p>
      {remove.error && <p role="alert" className="text-fine text-ink-2">{API_ERROR_LABELS[remove.error.kind] ?? REPLAY_LABELS.deleteFailed}</p>}
      <div className="flex gap-2">
        <button type="button" aria-disabled={remove.isPending} className="board-tool" onClick={() => remove.mutate(undefined, { onSuccess: () => void navigate('/sessions', { replace: true }) })}>{REPLAY_LABELS.confirmDelete}</button>
        <button type="button" className="board-tool" onClick={() => setIsAsking(false)}>{REPLAY_LABELS.keep}</button>
      </div>
    </div>
  );
}
