import type { BrowserMessage, StudentWork } from '@astra/contracts';
import { type CheckedWork, cleanStudentText, checkWorkOnBoard } from '@astra/board/shared';
import type { TutorBrain } from '../brain.ts';
import { decideOnReading, decideOnWork, decideWatch, getWorkWords, type WatchDecision, type WatchSituation, type WordMeaning } from './watch-rule.ts';

export interface BoardWorkOptions {
  tutor: Pick<TutorBrain, 'noteWork' | 'noteWatcher' | 'getBoard'>;
  /** Writes the checked work to the session log. */
  writeLog(message: BrowserMessage & { type: 'worked' }, checked: CheckedWork): void;
  /** Starts a tutor reply to these words, through the same gate as typed words. */
  speakUp(words: string): void;
  isTutorTalking(): boolean;
  getSecondsSinceQuestion(): number | null;
  readMeaning(words: string): Promise<WordMeaning | null>;
  getNowMs(): number;
  trace(name: string, fields?: Record<string, unknown>): void;
}

interface Unanswered {
  checked: CheckedWork;
  keys: readonly string[];
}

const getWorkKey = (work: StudentWork) => JSON.stringify(work.way === 'write' ? cleanStudentText(work.text) : work);

// What the student does on the board. Code checks it, notes it for the tutor, writes it to the log, and decides whether the tutor answers now, all before any model.
export function createBoardWork({ tutor, writeLog, speakUp, isTutorTalking, getSecondsSinceQuestion, readMeaning, getNowMs, trace }: BoardWorkOptions) {
  let spokeUpAtMs: number | null = null;
  let unanswered: Unanswered | null = null;
  let wrongKeys: readonly string[] = [];
  let hasLeanedIn = false;

  const noteAnswered = () => {
    unanswered = null;
  };

  const onWorked = (message: BrowserMessage & { type: 'worked' }) => {
    const noted = tutor.noteWork?.(message.work);
    if (!noted) return trace('workRefused', { way: message.work.way });
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
    // The tutor may have started talking while the words were being read, so the rule's gates get a second look.
    if (decision.act === 'speak' && !isTutorTalking()) speakAtPause(decision, seconds, draft);
  };

  return { onWorked, onPaused, noteAnswered };
}

function getDraft(text: string, board: NonNullable<ReturnType<NonNullable<TutorBrain['getBoard']>>>): WatchSituation['draft'] {
  const { reading, verdict } = checkWorkOnBoard({ way: 'write', id: 'draft' as never, text, ...(board.openTask ? { task: board.openTask } : {}) }, board.state);
  return reading ? { text, reading, verdict } : null;
}
