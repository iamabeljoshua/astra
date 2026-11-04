import { setTimeout as delay } from 'node:timers/promises';
import type { AgentMessage, BrowserMessage, ElementId, InkPoint, ReadMath, StudentAction, StudentWork, Task } from '@astra/contracts';
import { type CheckedWork, cleanStudentText, checkWorkOnBoard, getNod, getPickParts, type Nod, wantsSomethingElse } from '@astra/board/shared';
import type { BoardElement } from '@astra/board';
import type { SpokenReading } from './read-spoken.ts';
import { decideSpoken, type SpokenDecision, type SpokenExpected, type SpokenPart } from './spoken-answer.ts';
import type { TutorBrain } from '../brain.ts';
import { decideOnReading, decideOnWork, decideWatch, getGate, getWorkWords, type WatchDecision, type WatchSituation, type WordMeaning, decideOnSpokenWork } from './watch-rule.ts';

export interface BoardWorkOptions {
  tutor: Pick<TutorBrain, 'noteWork' | 'noteWatcher' | 'getBoard'>;
  writeLog(message: BrowserMessage & { type: 'worked' }, checked: CheckedWork): void;
  speakUp(words: string): void;
  isTutorTalking(): boolean;
  getSecondsSinceQuestion(): number | null;
  readMeaning(words: string): Promise<WordMeaning | null>;
  readStrokes(strokes: readonly (readonly InkPoint[])[]): Promise<{ text: string; ink: { tex?: string; isUnsure: boolean } } | null>;
  readSpokenWords(words: string, expects: SpokenExpected): Promise<SpokenReading>;
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
const MOST_INK_READS = 300;
const HOLD_WHILE_TYPING_MS = 1200;
const HOLD_LOOKS_EVERY_MS = 50;
const LONGEST_HOLD_MS = 8000;
const FIRST_SPOKEN_LINE = 1000;
const NOT_READ = '(handwriting that could not be read)';

const getWorkKey = (work: StudentWork) => JSON.stringify(work.way === 'write' ? cleanStudentText(work.text) : work);

// What the student does on the board: code checks it, notes it, logs it, and decides whether the tutor answers.
export function createBoardWork({ tutor, writeLog, speakUp, isTutorTalking, getSecondsSinceQuestion, readMeaning, readStrokes, readSpokenWords, writeHeardLog, send, getNowMs, trace }: BoardWorkOptions) {
  let spokenLines = 0;
  let inkReads = 0;
  let latestInkRead: { key: string; reading: ReturnType<BoardWorkOptions['readStrokes']> | Promise<null> } | null = null;
  let typedAtMs: number | null = null;
  let isAnsweringJudgedWork = false;
  let nodDue: Nod | null = null;
  const inkStrokes = new Map<string, InkPoint[]>();
  let spokeUpAtMs: number | null = null;
  let unanswered: Unanswered | null = null;
  let wrongKeys: readonly string[] = [];
  let hasLeanedIn = false;

  const noteTyping = () => {
    typedAtMs = getNowMs();
  };

  const waitWhileTyping = async () => {
    const startedMs = getNowMs();
    while (typedAtMs !== null && getNowMs() - typedAtMs < HOLD_WHILE_TYPING_MS && getNowMs() - startedMs < LONGEST_HOLD_MS) await delay(HOLD_LOOKS_EVERY_MS);
  };

  const takeNod = () => {
    const nod = nodDue;
    nodDue = null;
    return nod;
  };

  const noteAnswered = () => {
    isAnsweringJudgedWork = false;
    unanswered = null;
  };

  const onWorked = (message: BrowserMessage & { type: 'worked' }) => {
    if (message.work.way === 'write' && (message.work.ink || message.work.heard)) return trace('workRefused', { way: 'read by the agent' });
    takeWork(message);
  };

  const takeWork = (message: BrowserMessage & { type: 'worked' }, onTaken?: () => void) => {
    const noted = tutor.noteWork?.(message.work);
    if (!noted) return trace('workRefused', { way: message.work.way });
    typedAtMs = null;
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
      nodDue = getNod(message.work, checked);
      speakUp(getWorkWords(message.work));
    } else {
      unanswered = { checked, keys: wrongKeys };
    }
  };

  const onInkStroke = (action: StudentAction & { action: 'inkStroke' }) => {
    if (inkStrokes.size >= MOST_STROKES_HELD && !inkStrokes.has(action.id)) return;
    inkStrokes.set(action.id, [...(inkStrokes.get(action.id) ?? []), ...action.points]);
  };

  const readInkOnce = (strokes: readonly ElementId[]) => {
    const key = strokes.join();
    if (latestInkRead?.key === key) return latestInkRead.reading;
    if (inkReads >= MOST_INK_READS) return Promise.resolve(null);
    inkReads += 1;
    trace('inkReadStarted', { strokes: strokes.length });
    const reading = readStrokes(strokes.map((strokeId) => inkStrokes.get(strokeId) ?? [])).catch((error: unknown) => {
      trace('inkReadFailed', { problem: String(error) });
      return null;
    });
    latestInkRead = { key, reading };
    return reading;
  };

  const onInkPeek = ({ strokes }: BrowserMessage & { type: 'inkPeek' }) => void readInkOnce(strokes);

  const onInkDone = async ({ id, strokes, task, clockId, browserMs, startedMsAgo }: BrowserMessage & { type: 'inkDone' }) => {
    trace('inkDone', { strokes: strokes.length });
    const read = await readInkOnce(strokes);
    trace('inkRead', { strokes: strokes.length });
    strokes.forEach((strokeId) => inkStrokes.delete(strokeId));
    const work: StudentWork = { way: 'write', id, text: read?.text || NOT_READ, ...(task ? { task } : {}), ink: read?.ink ?? { isUnsure: true } };
    takeWork({ type: 'worked', clockId, browserMs, startedMsAgo, work }, () => send({ type: 'workRead', work }));
  };

  const getHeardWork = (text: string, heard: ReadMath, task: ElementId): StudentWork => {
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
      case 'askModel': {
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
    nodDue = getNod(work, noted.checked);
    return decideOnSpokenWork(work, noted.checked, noted.hadTask).act === 'reply';
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

  return { onWorked, onPaused, onInkStroke, onInkPeek, onInkDone, noteTyping, waitWhileTyping, onSpoken, hasOpenTask: () => getOpenTask() !== null, canSayStockWord: () => !isAnsweringJudgedWork && getOpenTask() === null, takeNod, noteAnswered };
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
