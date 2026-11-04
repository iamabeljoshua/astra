import type { BoardState } from '@astra/board';
import { getOpenTaskOnBoard } from '@astra/board/shared';
import type { ElementId, StudentWork } from '@astra/contracts';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { getVisualPlace, type VisualPeek } from '../board/boardStage';
import { BoardStageView } from '../board/BoardStageView';
import { getBoardRows } from '../board/boardRows';
import { MathField } from '../board/MathField';
import type { MarkWithoutTarget } from '../board/boardMarks';
import { MovingDot } from '../board/MovingDot';
import { PenBand } from '../board/PenBand';
import { SharedBoard } from '../board/SharedBoard';
import { TypedLine, type TypedLineHandle, useNextLineId } from '../board/TypedLine';
import { BOARD_WORK_LABELS, VOICE_LABELS } from '../strings';
import { AttachControl } from '../ui/AttachControl';
import type { FilesComingSoon } from '../ui/useFilesComingSoon';
import { isVoiceOver, type LiveVoice } from './liveVoice';
import { getTutorState } from './tutorState';
import { useReducedMotion } from '../board/useReducedMotion';

const DOT_SHOWS_MS = 280;

const LINES_BEFORE_THE_HINT_GOES = 2;

interface BoardFrame {
  board: BoardState;
  atMs: number;
}

function getLastWorkWords(board: BoardState): string {
  const line = [...board.elements.values()].reverse().find((element) => element.content.kind === 'studentLine')?.content;
  if (line?.kind !== 'studentLine') return '';
  const read = `${BOARD_WORK_LABELS.readAs} ${BOARD_WORK_LABELS.kinds[line.reading.kind]}.`;
  return line.verdict.status === 'right' ? `${read} ${BOARD_WORK_LABELS.checked}` : read;
}

function getLatestRowId(board: BoardState): string | null {
  const focused = board.focus?.split('.')[0];
  if (focused && board.elements.has(focused as ElementId)) return focused;
  const elements = [...board.elements.values()];
  for (const { id, content } of elements.reverse()) {
    const hangsOn = 'target' in content ? content.target : content.kind === 'task' && 'on' in content ? content.on : undefined;
    if (hangsOn !== undefined) {
      const root = hangsOn.split('.')[0] as string;
      if (board.elements.has(root as ElementId)) return root;
    }
    if (content.kind === 'writeMath' || content.kind === 'studentLine' || content.kind === 'text' || content.kind === 'diagram' || content.kind === 'plot' || content.kind === 'task') return id;
  }
  return null;
}

interface DotTarget {
  rowId: string | null;
  isWatching: boolean;
}

const AT_REST: DotTarget = { rowId: null, isWatching: false };
const ON_THE_LIVE_LINE: DotTarget = { rowId: 'live', isWatching: true };

// Says where the dot belongs: on what just happened, on the live line, or back over the tutor's words.
function useDotTarget(board: BoardState, isTutorSpeaking: boolean) {
  const [target, setTarget] = useState<DotTarget>(AT_REST);
  const latest = getLatestRowId(board);
  const [lastSeen, setLastSeen] = useState(latest);
  if (latest !== lastSeen) {
    setLastSeen(latest);
    setTarget({ rowId: latest, isWatching: false });
  }
  const wasSpeaking = useRef(false);
  useEffect(() => {
    if (wasSpeaking.current && !isTutorSpeaking) setTarget(ON_THE_LIVE_LINE);
    wasSpeaking.current = isTutorSpeaking;
  }, [isTutorSpeaking]);
  const watchLiveLine = useCallback(() => setTarget(ON_THE_LIVE_LINE), []);
  const goToRest = useCallback(() => setTarget(AT_REST), []);
  const watchRow = useCallback((rowId: string) => setTarget({ rowId, isWatching: true }), []);
  return { target, watchLiveLine, watchRow, goToRest };
}

interface LiveBoardProps {
  voice: LiveVoice;
  visual?: ReactNode;
  isConnecting?: boolean;
  onTutorState?(state: string | null): void;
  onTalk?: () => void;
  isTalkOn?: boolean;
  canTalk?: boolean;
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
export function LiveBoard({ voice, visual = null, onTalk, isTalkOn = false, canTalk = true, isConnecting = false, onTutorState, filesComingSoon }: LiveBoardProps) {
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
  const view = voice.getView();
  const { target: dotTarget, watchLiveLine, watchRow, goToRest } = useDotTarget(board, view.isTutorSpeaking);

  useEffect(() => {
    let animationFrame = requestAnimationFrame(function draw() {
      animationFrame = requestAnimationFrame(draw);
      setFrame(voice.getBoardNow());
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [voice]);

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
    <BoardStageView stage={board.stage} atMs={atMs} visual={visual} ariaLabel={VOICE_LABELS.board} peek={peek} onPeek={setPeek} footer={tools}>
      <p role="status" className="sr-only">{getLastWorkWords(board)}</p>
      <MovingDot arrival={isConnecting ? 'hidden' : isDotInTheMiddle ? 'shown' : null} rowId={dotTarget.rowId} isWatching={dotTarget.isWatching} isThinking={isThinking} isLively={!view.closedBecause && (view.isTutorSpeaking || view.isHeard || view.isThinking)} getLoudness={voice.getLoudness} />
      <SharedBoard
        board={board}
        atMs={atMs}
        onMarkProblem={reportProblem}
        onWork={sendWork}
        onMovePoint={movePoint}
        lineInTheBand={lineInTheBand}
        onFixReading={(text) => {
          setIsPenOpen(false);
          typedLine.current?.setLine(text);
        }}
        liveRow={
          <TypedLine
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
