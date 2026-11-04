import type { AgentMessage, BrowserMessage, ElementId, InkPoint, InkReading, StudentAction, StudentWork, Task } from '@astra/contracts';
import { type CheckedWork, cleanStudentText, checkWorkOnBoard, getPickParts, wantsSomethingElse } from '@astra/board/shared';
import type { BoardElement } from '@astra/board';
import type { SpokenReading } from './read-spoken.ts';
import { decideSpoken, type SpokenDecision, type SpokenExpected, type SpokenPart } from './spoken-answer.ts';
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
  /** What spoken words mean, read by a cheap model. */
  readSpokenWords(words: string, expects: SpokenExpected): Promise<SpokenReading>;
  /** Writes work the agent read itself, with no page behind it to stamp the time. */
  writeHeardLog(work: StudentWork, checked: CheckedWork): void;
  send(message: AgentMessage): void;
  getNowMs(): number;
  trace(name: string, fields?: Record<string, unknown>): void;
}

interface Unanswered {
  checked: CheckedWork;
  keys: readonly string[];
}

const MOST_STROKES_HELD = 400;
/** A spoken line takes an id the page's own count will not reach, because the page and the agent both name lines. */
const FIRST_SPOKEN_LINE = 1000;
const NOT_READ = '(handwriting that could not be read)';

const getWorkKey = (work: StudentWork) => JSON.stringify(work.way === 'write' ? cleanStudentText(work.text) : work);

// What the student does on the board: code checks it, notes it, logs it, and decides whether the tutor answers.
export function createBoardWork({ tutor, writeLog, speakUp, isTutorTalking, getSecondsSinceQuestion, readMeaning, readStrokes, readSpokenWords, writeHeardLog, send, getNowMs, trace }: BoardWorkOptions) {
  let spokenLines = 0;
  let isAnsweringJudgedWork = false;
  const inkStrokes = new Map<string, InkPoint[]>();
  let spokeUpAtMs: number | null = null;
  let unanswered: Unanswered | null = null;
  let wrongKeys: readonly string[] = [];
  let hasLeanedIn = false;

  const noteAnswered = () => {
    isAnsweringJudgedWork = false;
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
      isAnsweringJudgedWork = checked.verdict.status !== 'unknown';
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
    takeWork({ type: 'worked', clockId, browserMs, startedMsAgo, work }, () => send({ type: 'workRead', work }));
  };

  const getHeardWork = (text: string, heard: InkReading, task: ElementId): StudentWork => {
    spokenLines += 1;
    return { way: 'write', id: `s${FIRST_SPOKEN_LINE + spokenLines}` as ElementId, text, task, heard };
  };

  const toSpokenWork = async (text: string, task: Task, decision: SpokenDecision): Promise<StudentWork | null> => {
    switch (decision.act) {
      case 'talk':
        return null;
      case 'line':
        return getHeardWork(text, { tex: decision.tex, isUnsure: false }, task.id);
      case 'pick':
        return { way: 'pick', task: task.id, part: decision.part };
      case 'place':
        return { way: 'place', task: task.id, placed: decision.placed };
      case 'read': {
        const reading = await readSpokenWords(text, decision.expects);
        return reading.kind === 'line' ? getHeardWork(text, reading.heard, task.id) : null;
      }
    }
  };

  const getOpenTask = () => {
    const board = tutor.getBoard?.();
    const element = board?.openTask ? board.state.elements.get(board.openTask) : undefined;
    return element?.content.kind === 'task' ? { task: element.content, board } : null;
  };

  // Whether the tutor should answer what was said. A spoken answer takes the same road as a typed or written one, and anything else stays conversation.
  const onSpoken = async (rawText: string): Promise<boolean> => {
    const open = getOpenTask();
    if (!open) return true;
    const text = cleanStudentText(rawText);
    if (wantsSomethingElse(text)) {
      const leaving: StudentWork = { way: 'leave', task: open.task.id };
      const left = tutor.noteWork?.(leaving);
      if (left) {
        writeHeardLog(leaving, left.checked);
        send({ type: 'workRead', work: leaving });
      }
      return true;
    }
    const decision = decideSpoken(text, open.task, getSpokenParts(open.task, open.board?.state));
    trace('spokenDecided', { ...decision });
    const work = await toSpokenWork(text, open.task, decision);
    const noted = work && tutor.noteWork?.(work);
    if (!work || !noted) return true;
    writeHeardLog(work, noted.checked);
    send({ type: 'workRead', work });
    hasLeanedIn = false;
    // Someone who has spoken is waiting, so what code cannot judge gets the tutor's question now, where a typed line would wait for a pause.
    return noted.checked.verdict.status === 'unknown' || decideOnWork(work, noted.checked, noted.hadTask).act === 'reply';
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

  return { onWorked, onPaused, onInkStroke, onInkDone, onSpoken, hasOpenTask: () => getOpenTask() !== null, canReactAloud: () => !isAnsweringJudgedWork && getOpenTask() === null, noteAnswered };
}

function getSpokenParts(task: Task, board: { elements: ReadonlyMap<ElementId, BoardElement> } | undefined): SpokenPart[] {
  if (task.way !== 'pick') return [];
  const element = board?.elements.get(task.on);
  const nodes = element?.content.kind === 'diagram' ? element.content.nodes : [];
  return getPickParts(element).map(({ part }) => ({ part, label: nodes.find(({ name }) => name === part)?.label ?? part }));
}

function getDraft(text: string, board: NonNullable<ReturnType<NonNullable<TutorBrain['getBoard']>>>): WatchSituation['draft'] {
  const { reading, verdict } = checkWorkOnBoard({ way: 'write', id: 'draft' as ElementId, text, ...(board.openTask ? { task: board.openTask } : {}) }, board.state);
  return reading ? { text, reading, verdict } : null;
}
