import type { BoardState } from '@astra/board';
import { getOpenTaskOnBoard } from '@astra/board/shared';
import type { ElementId, StudentWork } from '@astra/contracts';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getVisualPlace, type VisualPeek } from '../board/boardStage';
import { BoardStageView } from '../board/BoardStageView';
import { getBoardRows } from '../board/boardRows';
import { MathField } from '../board/MathField';
import type { MarkWithoutTarget } from '../board/boardMarks';
import { MovingDot } from '../board/MovingDot';
import { useDotTarget } from '../board/useDotTarget';
import { PenBand } from '../board/PenBand';
import { SharedBoard } from '../board/SharedBoard';
import { TypedLine, type TypedLineHandle, useNextLineId } from '../board/TypedLine';
import { getKeyMoments, getRecapMoment } from '../replay/keyMoments';
import { BOARD_WORK_LABELS, VOICE_LABELS } from '../strings';
import { AttachControl } from '../ui/AttachControl';
import type { FilesComingSoon } from '../ui/useFilesComingSoon';
import { isVoiceOver, type LiveVoice } from './liveVoice';
import { getTutorState } from './tutorState';
import { useReducedMotion } from '../board/useReducedMotion';

const DOT_SHOWS_MS = 280;

const LINES_BEFORE_THE_HINT_GOES = 2;

export interface BoardFrame {
  board: BoardState;
  atMs: number;
}

function getLastWorkWords(board: BoardState): string {
  const line = [...board.elements.values()].reverse().find((element) => element.content.kind === 'studentLine')?.content;
  if (line?.kind !== 'studentLine') return '';
  const read = `${BOARD_WORK_LABELS.readAs} ${BOARD_WORK_LABELS.kinds[line.reading.kind]}.`;
  return line.verdict.status === 'right' ? `${read} ${BOARD_WORK_LABELS.checked}` : read;
}

interface LiveBoardProps {
  voice: LiveVoice;
  /** What the session's right side shows while teaching, read every frame, because a scene plays on the board's clock. */
  getVisual?(frame: BoardFrame): ReactNode;
  isConnecting?: boolean;
  onTutorState?(state: string | null): void;
  onTalk?: () => void;
  isTalkOn?: boolean;
  canTalk?: boolean;
  /** The student has ended the session, so the board only looks back, and takes no more work. */
  isLookingBack?: boolean;
  /** Without it the board offers no photo or PDF control. */
  filesComingSoon?: FilesComingSoon;
}

function useDotInTheMiddle(isConnecting: boolean): boolean {
  const isReducedMotion = useReducedMotion();
  const [hasLeft, setHasLeft] = useState(isReducedMotion);
  if (isConnecting && hasLeft && !isReducedMotion) setHasLeft(false);
  useEffect(() => {
    if (isConnecting) return undefined;
    const leaving = setTimeout(() => setHasLeft(true), DOT_SHOWS_MS);
    return () => clearTimeout(leaving);
  }, [isConnecting]);
  return !hasLeft;
}

// The board is a pure reading of the clock, so one read per frame is all it needs.
export function LiveBoard({ voice, getVisual, onTalk, isTalkOn = false, canTalk = true, isConnecting = false, onTutorState, isLookingBack = false, filesComingSoon }: LiveBoardProps) {
  const isDotInTheMiddle = useDotInTheMiddle(isConnecting);
  const [frame, setFrame] = useState<BoardFrame>(() => voice.getBoardNow());
  const [activity, setActivity] = useState(0);
  const [isMathKeysOpen, setIsMathKeysOpen] = useState(false);
  const [isPenOpen, setIsPenOpen] = useState(false);
  const [lineInTheBand, setLineInTheBand] = useState<ElementId | null>(null);
  const [peek, setPeek] = useState<VisualPeek | null>(null);
  const penDone = useRef<(() => void) | null>(null);
  const typedLine = useRef<TypedLineHandle>(null);
  const isVisualBigNow = useRef(false);
  const { board, atMs } = frame;
  const visual = getVisual?.(frame) ?? null;
  const view = voice.getView();
  const { target: dotTarget, watchLiveLine, watchRow, goToRest } = useDotTarget(board, view.isTutorSpeaking);

  const keyMoments = useMemo(() => (isLookingBack ? getKeyMoments(voice.player.getOperations()) : []), [isLookingBack, voice]);

  useEffect(() => {
    let animationFrame = requestAnimationFrame(function draw() {
      animationFrame = requestAnimationFrame(draw);
      const { tutorHeard, tutorComing, recap } = voice.getView();
      const moment = recap ? getRecapMoment(keyMoments, tutorHeard.length / Math.max(1, tutorHeard.length + tutorComing.length)) : null;
      setFrame(moment === null ? voice.getBoardNow() : { board: voice.player.getBoard(moment), atMs: moment });
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [voice, keyMoments]);

  useEffect(() => {
    const stopOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      voice.stopTutor();
      goToRest();
    };
    document.addEventListener('keydown', stopOnEscape);
    return () => document.removeEventListener('keydown', stopOnEscape);
  }, [voice, goToRest]);

  const mode = board.stage?.mode;
  useEffect(() => {
    if (mode !== 'handsOn') return;
    typedLine.current?.focus();
    watchLiveLine();
  }, [mode, watchLiveLine]);

  const isVisualBig = Boolean(visual) && getVisualPlace({ stage: board.stage, peek, atMs, isReducedMotion: false }).smallShare === 0;
  useEffect(() => {
    isVisualBigNow.current = isVisualBig;
  }, [isVisualBig]);

  const reportProblem = useCallback((problem: MarkWithoutTarget) => voice.reportMarkNotDrawn(problem.markId), [voice]);
  const getBoard = useCallback(() => voice.getBoardNow().board, [voice]);
  const nextLineId = useNextLineId(getBoard);
  const sendPause = useCallback((seconds: number, draft?: string) => voice.sendPause(seconds, draft), [voice]);
  const closePen = useCallback(() => setIsPenOpen(false), []);
  const bringBoard = useCallback(() => setPeek({ isBig: false, atMs: voice.getBoardNow().atMs }), [voice]);
  const sendWork = useCallback(
    (work: StudentWork, startedMsAgo = 0) => {
      voice.sendWork(work, startedMsAgo);
      setActivity((count) => count + 1);
      setFrame(voice.getBoardNow());
    },
    [voice],
  );
  const movePoint = useCallback(
    (taskId: ElementId, x: number) => {
      voice.movePoint(taskId, x);
      voice.noteTyping();
      const task = voice.getBoardNow().board.elements.get(taskId)?.content;
      if (task?.kind === 'task' && 'on' in task && task.on !== undefined) watchRow(task.on);
      setActivity((count) => count + 1);
    },
    [voice, watchRow],
  );
  const onPenWorking = useCallback(() => {
    voice.noteTyping();
    watchLiveLine();
    setActivity((count) => count + 1);
  }, [voice, watchLiveLine]);
  const onTyping = useCallback(() => {
    voice.noteTyping();
    watchLiveLine();
    if (isVisualBigNow.current) bringBoard();
  }, [voice, watchLiveLine, bringBoard]);

  const rows = getBoardRows(board);
  const task = getOpenTaskOnBoard(board);
  const hasWrittenBefore = rows.filter(({ element }) => element.content.kind === 'studentLine').length >= LINES_BEFORE_THE_HINT_GOES;
  const isThinking = (view.isThinking || rows.some(({ isBeingRead }) => isBeingRead)) && !view.closedBecause;
  const sendKeyedLine = ({ text, tex }: { text: string; tex: string | null }) => {
    sendWork({ way: 'write', id: nextLineId(), text, ...(task ? { task: task.id } : {}), ...(tex === null ? {} : { keyed: { tex, isUnsure: false } }) });
  };
  const openedFor = useRef<ElementId | null>(null);
  useEffect(() => {
    if (!task || openedFor.current === task.id) return;
    openedFor.current = task.id;
    if (task.way !== 'write') return;
    setIsMathKeysOpen(false);
    setIsPenOpen(task.byHand === true);
  }, [task]);
  const isTutorGone = isVoiceOver(view.phase) || view.closedBecause !== null;
  const tutorState = getTutorState(view, task !== null);
  useEffect(() => onTutorState?.(tutorState), [onTutorState, tutorState]);
  const getBand = () => {
    if (isPenOpen) return <PenBand task={task} voice={voice} nextLineId={nextLineId} onLineChange={setLineInTheBand} doneRef={penDone} onWorking={onPenWorking} onFinished={closePen} />;
    if (isMathKeysOpen) return <MathField onLine={sendKeyedLine} onTyping={onTyping} />;
    return null;
  };
  const tools = (
    <div className="board-tools" data-testid="board-tools">
      {filesComingSoon && <AttachControl filesComingSoon={filesComingSoon} className="board-tool" />}
      {canTalk && <button type="button" className="board-tool" aria-pressed={isTalkOn} onClick={onTalk}>{BOARD_WORK_LABELS.talk}</button>}
      {isVisualBig && (
        <button
          type="button"
          className="board-tool"
          onClick={() => {
            bringBoard();
            typedLine.current?.focus();
          }}
        >
          {BOARD_WORK_LABELS.type}
        </button>
      )}
      <button
        type="button"
        className="board-tool"
        disabled={isTutorGone}
        data-testid="pen-tool"
        aria-pressed={isPenOpen}
        onClick={() => {
          if (isVisualBig) bringBoard();
          setIsMathKeysOpen(false);
          setIsPenOpen((isOpen) => !isOpen);
        }}
      >
        {BOARD_WORK_LABELS.pen}
      </button>
      <button
        type="button"
        className="board-tool"
        disabled={isTutorGone}
        aria-pressed={isMathKeysOpen}
        onClick={() => {
          if (isVisualBig) bringBoard();
          setIsPenOpen(false);
          setIsMathKeysOpen((isOpen) => !isOpen);
        }}
      >
        {BOARD_WORK_LABELS.mathKeys}
      </button>
      <span className="board-hint">{BOARD_WORK_LABELS.hint}</span>
      {lineInTheBand && <button type="button" className="board-tool-main ml-auto" data-testid="pen-done" onClick={() => penDone.current?.()}>{BOARD_WORK_LABELS.done}</button>}
    </div>
  );
  return (
    <BoardStageView stage={board.stage} atMs={atMs} visual={visual} ariaLabel={VOICE_LABELS.board} peek={peek} onPeek={setPeek} footer={isLookingBack ? null : tools}>
      <p role="status" className="sr-only">{getLastWorkWords(board)}</p>
      <MovingDot arrival={isConnecting ? 'hidden' : isDotInTheMiddle ? 'shown' : null} rowId={dotTarget.rowId} isWatching={dotTarget.isWatching} isThinking={isThinking} isLively={!view.closedBecause && (view.isTutorSpeaking || view.isHeard || view.isThinking)} getLoudness={voice.getLoudness} />
      <SharedBoard
        board={board}
        atMs={atMs}
        onMarkProblem={reportProblem}
        {...(isLookingBack ? {} : { onWork: sendWork, onMovePoint: movePoint })}
        lineInTheBand={lineInTheBand}
        onFixReading={(text) => {
          setIsPenOpen(false);
          typedLine.current?.setLine(text);
        }}
        liveRow={
          !isLookingBack && <TypedLine
            handleRef={typedLine}
            task={task}
            getBoard={getBoard}
            onWork={sendWork}
            onPause={sendPause}
            onTyping={onTyping}
            activity={activity}
            hasWrittenBefore={hasWrittenBefore}
            nextLineId={nextLineId}
            isTutorGone={isTutorGone}
            band={getBand()}
          />
        }
      />
    </BoardStageView>
  );
}
