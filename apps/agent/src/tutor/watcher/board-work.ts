import type { AgentMessage, BrowserMessage, ElementId, InkPoint, StudentAction, StudentWork } from '@astra/contracts';
import { type CheckedWork, cleanStudentText, checkWorkOnBoard } from '@astra/board/shared';
import type { TutorBrain } from '../brain.ts';
import { decideOnReading, decideOnWork, decideWatch, getGate, getWorkWords, type WatchDecision, type WatchSituation, type WordMeaning } from './watch-rule.ts';

export interface BoardWorkOptions {
  tutor: Pick<TutorBrain, 'noteWork' | 'noteWatcher' | 'getBoard'>;
  writeLog(message: BrowserMessage & { type: 'worked' }, checked: CheckedWork): void;
  speakUp(words: string): void;
  isTutorTalking(): boolean;
  getSecondsSinceQuestion(): number | null;
  readMeaning(words: string): Promise<WordMeaning | null>;
  readStrokes(strokes: readonly (readonly InkPoint[])[]): Promise<{ text: string; ink: { tex?: string; isUnsure: boolean } } | null>;
  send(message: AgentMessage): void;
  getNowMs(): number;
  trace(name: string, fields?: Record<string, unknown>): void;
}

interface Unanswered {
  checked: CheckedWork;
  keys: readonly string[];
}

const MOST_STROKES_HELD = 400;
const NOT_READ = '(handwriting that could not be read)';

const getWorkKey = (work: StudentWork) => JSON.stringify(work.way === 'write' ? cleanStudentText(work.text) : work);

// What the student does on the board: code checks it, notes it, logs it, and decides whether the tutor answers.
export function createBoardWork({ tutor, writeLog, speakUp, isTutorTalking, getSecondsSinceQuestion, readMeaning, readStrokes, send, getNowMs, trace }: BoardWorkOptions) {
  const inkStrokes = new Map<string, InkPoint[]>();
  let spokeUpAtMs: number | null = null;
  let unanswered: Unanswered | null = null;
  let wrongKeys: readonly string[] = [];
  let hasLeanedIn = false;

  const noteAnswered = () => {
    unanswered = null;
  };

  const onWorked = (message: BrowserMessage & { type: 'worked' }) => {
    if (message.work.way === 'write' && message.work.ink) return trace('workRefused', { way: 'ink' });
    takeWork(message);
  };

  const takeWork = (message: BrowserMessage & { type: 'worked' }, onTaken?: () => void) => {
    const noted = tutor.noteWork?.(message.work);
    if (!noted) return trace('workRefused', { way: message.work.way });
    onTaken?.();
    const { checked, hadTask } = noted;
    hasLeanedIn = false;
    writeLog(message, checked);
    const key = getWorkKey(message.work);
    if (checked.verdict.status === 'wrong') wrongKeys = [...wrongKeys, key];
    const decision = decideOnWork(message.work, checked, hadTask);
    trace('workDecided', { way: message.work.way, status: checked.verdict.status, ...decision });
    if (decision.act === 'reply') {
      noteAnswered();
      speakUp(getWorkWords(message.work));
    } else {
      unanswered = { checked, keys: wrongKeys };
    }
  };

  const onInkStroke = (action: StudentAction & { action: 'inkStroke' }) => {
    if (inkStrokes.size >= MOST_STROKES_HELD && !inkStrokes.has(action.id)) return;
    inkStrokes.set(action.id, [...(inkStrokes.get(action.id) ?? []), ...action.points]);
  };

  // Takes a finished line as work once it is read, and a failed read still reaches the tutor.
  const onInkDone = async ({ id, strokes, task, clockId, browserMs, startedMsAgo }: BrowserMessage & { type: 'inkDone' }) => {
    const points = strokes.map((strokeId: ElementId) => inkStrokes.get(strokeId) ?? []);
    strokes.forEach((strokeId) => inkStrokes.delete(strokeId));
    const read = await readStrokes(points).catch((error: unknown) => {
      trace('inkReadFailed', { problem: String(error) });
      return null;
    });
    const work: StudentWork = { way: 'write', id, text: read?.text || NOT_READ, ...(task ? { task } : {}), ink: read?.ink ?? { isUnsure: true } };
    takeWork({ type: 'worked', clockId, browserMs, startedMsAgo, work }, () => send({ type: 'inkRead', work }));
  };

  const getSituation = (seconds: number, draftText: string | undefined): WatchSituation => {
    const board = tutor.getBoard?.();
    const draft = draftText && board ? getDraft(draftText, board) : null;
    const nowMs = getNowMs();
    return {
      secondsPaused: seconds,
      isTutorTalking: isTutorTalking(),
      secondsSinceQuestion: getSecondsSinceQuestion(),
      secondsSinceSpokeUp: spokeUpAtMs === null ? null : (nowMs - spokeUpAtMs) / 1000,
      draft,
      unanswered: unanswered && { verdict: unanswered.checked.verdict, isSameWrongLineTwice: new Set(unanswered.keys).size < unanswered.keys.length },
      hasOpenTask: board?.openTask != null,
      hasLeanedInOnThisSilence: hasLeanedIn,
    };
  };

  const speakAtPause = (decision: WatchDecision & { act: 'speak' }, seconds: number, draftText: string | undefined) => {
    spokeUpAtMs = getNowMs();
    hasLeanedIn = true;
    noteAnswered();
    tutor.noteWatcher?.({ why: decision.why, seconds_paused: seconds, ...(draftText ? { unsent_draft: cleanStudentText(draftText) } : {}) });
    trace('watcherSpoke', { why: decision.why, seconds });
    speakUp('(has paused)');
  };

  const onPaused = async ({ seconds, draft }: BrowserMessage & { type: 'paused' }) => {
    const situation = getSituation(seconds, draft);
    const first = decideWatch(situation);
    const decision = first.act === 'readWords' ? decideOnReading(first, await readMeaning(situation.draft?.text ?? '')) : first;
    trace('watcherDecided', { seconds, ...decision });
    if (decision.act === 'speak' && getGate(getSituation(seconds, draft)) === null) speakAtPause(decision, seconds, draft);
  };

  return { onWorked, onPaused, onInkStroke, onInkDone, noteAnswered };
}

function getDraft(text: string, board: NonNullable<ReturnType<NonNullable<TutorBrain['getBoard']>>>): WatchSituation['draft'] {
  const { reading, verdict } = checkWorkOnBoard({ way: 'write', id: 'draft' as ElementId, text, ...(board.openTask ? { task: board.openTask } : {}) }, board.state);
  return reading ? { text, reading, verdict } : null;
}
