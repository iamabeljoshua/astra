import type { BoardState } from '@astra/board';
import { getOpenTaskOnBoard } from '@astra/board/shared';
import type { StudentWork } from '@astra/contracts';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { getVisualPlace, type VisualPeek } from '../board/boardStage';
import { BoardStageView } from '../board/BoardStageView';
import { getBoardRows } from '../board/boardRows';
import { MathKeys } from '../board/MathKeys';
import type { MarkWithoutTarget } from '../board/boardMarks';
import { MovingDot } from '../board/MovingDot';
import { SharedBoard } from '../board/SharedBoard';
import { TypedLine, type TypedLineHandle } from '../board/TypedLine';
import { BOARD_WORK_LABELS, VOICE_LABELS } from '../strings';
import type { LiveVoice } from './liveVoice';

/** The line's hint stays until the student has plainly got the idea. */
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

/** The newest row anything happened on, which the dot follows. */
function getLatestRowId(board: BoardState): string | null {
  const elements = [...board.elements.values()];
  for (const { id, content } of elements.reverse()) {
    if ('target' in content && typeof content.target === 'string') {
      const root = content.target.split('.')[0] as string;
      if (board.elements.has(root as never)) return root;
    }
    if (content.kind === 'writeMath' || content.kind === 'studentLine' || content.kind === 'text' || content.kind === 'diagram' || content.kind === 'task') return id;
  }
  return null;
}

interface DotTarget {
  rowId: string | null;
  isWatching: boolean;
}

const AT_REST: DotTarget = { rowId: null, isWatching: false };
const ON_THE_LIVE_LINE: DotTarget = { rowId: 'live', isWatching: true };

// The dot flies to whatever just happened, watches the live line while the student works or once the turn has played, and goes back over the tutor's words if the student stops it.
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
  return { target, watchLiveLine, goToRest };
}

// The board is a pure reading of the clock, so one read per frame is all it needs.
export function LiveBoard({ voice, visual = null, onTalk, isTalkOn = false, canTalk = true }: { voice: LiveVoice; visual?: ReactNode; onTalk?: () => void; isTalkOn?: boolean; canTalk?: boolean }) {
  const [frame, setFrame] = useState<BoardFrame>(() => voice.getBoardNow());
  const [activity, setActivity] = useState(0);
  const goToRest = useRef(() => {});
  const watchLiveLine = useRef(() => {});
  const isVisualBigNow = useRef(false);
  const [isMathKeysOpen, setIsMathKeysOpen] = useState(false);
  const typedLine = useRef<TypedLineHandle>(null);
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
      goToRest.current();
    };
    document.addEventListener('keydown', stopOnEscape);
    return () => document.removeEventListener('keydown', stopOnEscape);
  }, [voice]);
  const reportProblem = useCallback((problem: MarkWithoutTarget) => voice.reportMarkNotDrawn(problem.markId), [voice]);
  const getBoard = useCallback(() => voice.getBoardNow().board, [voice]);
  const sendWork = useCallback(
    (work: StudentWork) => {
      voice.sendWork(work);
      setActivity((count) => count + 1);
      setFrame(voice.getBoardNow());
    },
    [voice],
  );
  const sendPause = useCallback((seconds: number, draft?: string) => voice.sendPause(seconds, draft), [voice]);
  const { board, atMs } = frame;
  const hasRows = getBoardRows(board).length > 0;
  const [peek, setPeek] = useState<VisualPeek | null>(null);
  const isVisualBig = Boolean(visual) && getVisualPlace({ stage: board.stage, peek, atMs, isReducedMotion: false }).smallShare === 0;
  const bringBoard = useCallback(() => {
    setPeek({ isBig: false, atMs: voice.getBoardNow().atMs });
  }, [voice]);
  const mode = board.stage?.mode;
  useEffect(() => {
    if (mode !== 'handsOn') return;
    typedLine.current?.focus();
    watchLiveLine.current();
  }, [mode]);
  const view = voice.getView();
  const dot = useDotTarget(board, view.isTutorSpeaking);
  useEffect(() => {
    goToRest.current = dot.goToRest;
    watchLiveLine.current = dot.watchLiveLine;
  }, [dot.goToRest, dot.watchLiveLine]);
  const { watchLiveLine: watchLine } = dot;
  const onTyping = useCallback(() => {
    watchLine();
    if (isVisualBigNow.current) bringBoard();
  }, [watchLine, bringBoard]);
  useEffect(() => {
    isVisualBigNow.current = isVisualBig;
  }, [isVisualBig]);
  const hasWrittenBefore = [...board.elements.values()].filter(({ content }) => content.kind === 'studentLine').length >= LINES_BEFORE_THE_HINT_GOES;
  return (
    <BoardStageView
      stage={board.stage}
      hasWriting={hasRows}
      atMs={atMs}
      visual={visual}
      ariaLabel={VOICE_LABELS.board}
      peek={peek}
      onPeek={setPeek}
      footer={
        <div className="board-tools" data-testid="board-tools">
          {canTalk && <button type="button" className="board-tool" aria-pressed={isTalkOn} onClick={onTalk}>{BOARD_WORK_LABELS.talk}</button>}
          {isVisualBig && <button type="button" className="board-tool" onClick={() => { bringBoard(); typedLine.current?.focus(); }}>{BOARD_WORK_LABELS.type}</button>}
          <button type="button" className="board-tool" aria-pressed={isMathKeysOpen} onClick={() => setIsMathKeysOpen((isOpen) => !isOpen)}>{BOARD_WORK_LABELS.mathKeys}</button>
          {isMathKeysOpen ? <MathKeys onKey={(key) => typedLine.current?.insert(key)} /> : <span className="board-hint">{BOARD_WORK_LABELS.hint}</span>}
        </div>
      }
    >
      <p role="status" className="sr-only">{getLastWorkWords(board)}</p>
      <MovingDot rowId={dot.target.rowId} isWatching={dot.target.isWatching} isThinking={view.isThinking && !view.closedBecause} isLively={!view.closedBecause && (view.isTutorSpeaking || view.isHeard || view.isThinking)} getLoudness={voice.getLoudness} />
      <SharedBoard
        board={board}
        atMs={atMs}
        onMarkProblem={reportProblem}
        onWork={sendWork}
        liveRow={<TypedLine handleRef={typedLine} task={getOpenTaskOnBoard(board)} getBoard={getBoard} onWork={sendWork} onPause={sendPause} onTyping={onTyping} activity={activity} hasWrittenBefore={hasWrittenBefore} />}
      />
    </BoardStageView>
  );
}
