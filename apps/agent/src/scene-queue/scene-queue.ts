import { isAboutBeingUnsafe } from '../scenes/content-check.ts';
import type { LessonPlan, LessonStep } from '../lesson-plan/lesson-plan.ts';
import type { LessonEvent, LessonState } from '../lesson-plan/plan-progress.ts';
import { MAY_BE_ABOUT_SAFETY, PLAIN_REFUSALS, SAFETY_REPLY } from '../tutor/safety-words.ts';
import { type AheadFacts, getPrepareRefusal, getWriteRefusal } from './ahead-budget.ts';

export type SceneSource = 'library' | 'written';
export type EntryState = 'making' | 'ready' | 'due' | 'asked' | 'shown';

export type AheadNews = 'ready' | 'shown' | 'missed' | 'lateWrite' | 'settled' | 'failed' | 'declined';

export interface QueueEntry {
  request: string;
  lessonTopic: string;
  stepIndex: number;
  source: SceneSource;
  state: EntryState;
}

export interface QueueScenes {
  prepare(request: string): boolean;
  ask(request: string): void;
  dropPrepared(request: string): void;
  dropWaiting(how: 'movedOn' | 'switched' | 'studentTurn'): void;
  stopForSafety(): void;
}

export interface SceneQueueOptions {
  scenes: QueueScenes;
  readLibrary(plan: LessonPlan): Promise<readonly (string | null)[]>;
  getFacts(): AheadFacts;
  canPlay(): boolean;
  moveToNextStep(): void;
  trace(name: string, fields?: Record<string, unknown>): void;
}

export interface SceneQueue {
  onLesson(state: LessonState, event?: LessonEvent | null): void;
  onPageReady(): void;
  onTutorAsk(topic: string): void;
  noteAhead(request: string, state: AheadNews): void;
  noteStudentWords(words: string): void;
  noteTutorReply(reply: { spokenText: string; refusalCategory: string | null }): void;
  getPictureTopic(): string | null;
  getEntries(): readonly QueueEntry[];
}

const MOST_REQUEST_CHARACTERS = 80;

const sameWords = (first: string, second: string) => first.trim().toLowerCase() === second.trim().toLowerCase();

function toRequest(lessonTopic: string, teach: string): string {
  const words = `${lessonTopic}: ${teach}`;
  if (words.length <= MOST_REQUEST_CHARACTERS) return words;
  return words.slice(0, words.lastIndexOf(' ', MOST_REQUEST_CHARACTERS));
}

function getWanted(lessonTopic: string, step: LessonStep | undefined, title: string | null | undefined): Pick<QueueEntry, 'request' | 'source'> | null {
  if (title) return { request: title, source: 'library' };
  return step?.teach ? { request: toRequest(lessonTopic, step.teach), source: 'written' } : null;
}

// Holds what is next in a running lesson as data, and only ever asks the desk, so nothing here can hold a word.
export function createSceneQueue({ scenes, readLibrary, getFacts, canPlay, moveToNextStep, trace }: SceneQueueOptions): SceneQueue {
  let entries: QueueEntry[] = [];
  let lesson: { plan: LessonPlan; stepIndex: number } | null = null;
  let isStopped = false;
  let isHeld = false;
  let isReplying = false;
  let writesStarted = 0;
  let lateWrites = 0;
  let lastRefusal: string | null = null;
  const givenUp = new Set<string>();
  const libraryByTopic = new Map<string, readonly (string | null)[] | 'reading'>();

  const getLibrary = (topic: string) => {
    const known = libraryByTopic.get(topic);
    return known === 'reading' ? undefined : known;
  };

  const getFactsNow = (): AheadFacts => ({ ...getFacts(), writesStarted });

  const findEntry = (stepIndex: number) => (lesson ? entries.find((entry) => entry.lessonTopic === lesson?.plan.topic && entry.stepIndex === stepIndex) : undefined);

  const remove = (entry: QueueEntry) => {
    entries = entries.filter((other) => other !== entry);
    scenes.dropPrepared(entry.request);
  };

  const canPrepare = () => !isStopped && !isHeld && canPlay();

  const startEntry = (stepIndex: number): QueueEntry | null => {
    if (!lesson || !canPrepare()) return null;
    const library = getLibrary(lesson.plan.topic);
    if (!library) return null;
    const wanted = getWanted(lesson.plan.topic, lesson.plan.steps[stepIndex], library[stepIndex]);
    if (!wanted) return null;
    const facts = getFactsNow();
    const refusal = wanted.source === 'library' ? getPrepareRefusal(facts) : getWriteRefusal(facts);
    if (refusal) {
      if (refusal !== lastRefusal) trace('sceneAheadRefused', { refusal, source: wanted.source, stepIndex });
      lastRefusal = refusal;
      return null;
    }
    if (givenUp.has(wanted.request) || !scenes.prepare(wanted.request)) return null;
    if (wanted.source === 'written') writesStarted += 1;
    const entry: QueueEntry = { ...wanted, lessonTopic: lesson.plan.topic, stepIndex, state: 'making' };
    entries = [...entries, entry];
    trace('sceneAheadStarted', { text: entry.request, source: entry.source, stepIndex, wallMs: Date.now() });
    return entry;
  };

  const isMakingWrite = () => lateWrites > 0 || entries.some((entry) => entry.source === 'written' && (entry.state === 'making' || entry.state === 'due' || entry.state === 'asked'));

  const fillAhead = () => {
    if (!lesson) return;
    const nextIndex = lesson.stepIndex + 1;
    if (findEntry(nextIndex)) return;
    const title = getLibrary(lesson.plan.topic)?.[nextIndex];
    if (!title && isMakingWrite()) return;
    startEntry(nextIndex);
  };

  const askDue = () => {
    for (const entry of entries) {
      if (entry.state !== 'due') continue;
      entry.state = 'asked';
      scenes.ask(entry.request);
    }
  };

  const makeDue = (entry: QueueEntry) => {
    entry.state = 'due';
    trace('sceneCue', { text: entry.request, source: entry.source, stepIndex: entry.stepIndex, wallMs: Date.now() });
    if (!isReplying) askDue();
  };

  // A saved scene for the step the lesson is on costs nothing, so it can start here. A write for this step would come too late.
  const reachStep = () => {
    if (!lesson) return;
    const { stepIndex, plan } = lesson;
    const known = findEntry(stepIndex);
    if (known?.state === 'due' || known?.state === 'asked' || known?.state === 'shown') return;
    if (known) return makeDue(known);
    if (!getLibrary(plan.topic)?.[stepIndex]) return;
    const started = startEntry(stepIndex);
    if (started) makeDue(started);
  };

  const dropPassed = () => {
    if (!lesson) return;
    const { plan, stepIndex } = lesson;
    for (const entry of entries) if (entry.lessonTopic !== plan.topic || entry.stepIndex < stepIndex) remove(entry);
  };

  const dropStepSkippedTo = (stepIndex: number) => {
    const known = findEntry(stepIndex);
    if (known) remove(known);
  };

  const startLibraryRead = (plan: LessonPlan) => {
    if (libraryByTopic.has(plan.topic)) return;
    libraryByTopic.set(plan.topic, 'reading');
    void readLibrary(plan)
      .catch(() => [])
      .then((titles) => {
        libraryByTopic.set(plan.topic, titles);
        if (lesson?.plan.topic !== plan.topic) return;
        reachStep();
        fillAhead();
      });
  };

  const stopForGood = () => {
    if (isStopped) return;
    isStopped = true;
    entries = [];
    scenes.stopForSafety();
    trace('sceneAheadStopped');
  };

  return {
    onLesson({ active }, event = null) {
      if (!active) return;
      const wasTopic = lesson?.plan.topic ?? null;
      const wasStep = lesson?.stepIndex ?? null;
      lesson = { plan: active.plan, stepIndex: active.stepIndex };
      if (isStopped) return;
      const isSwitch = wasTopic !== active.plan.topic;
      if (isSwitch && wasTopic !== null) scenes.dropWaiting('switched');
      // Anything older ended on the student's turn, so what the tutor asked for in this same reply is what it moved on to.
      const isTutorsOwnMove = event === 'teachingAgain' || event === 'movedOn';
      if (!isSwitch && !isTutorsOwnMove && wasStep !== active.stepIndex) scenes.dropWaiting('movedOn');
      dropPassed();
      startLibraryRead(active.plan);
      if (event === 'skipped') dropStepSkippedTo(active.stepIndex);
      else if (isSwitch || wasStep !== active.stepIndex) reachStep();
      fillAhead();
    },
    onPageReady() {
      if (!isStopped) fillAhead();
    },
    onTutorAsk(topic) {
      if (isStopped) return;
      const next = lesson ? findEntry(lesson.stepIndex + 1) : undefined;
      if (next && sameWords(next.request, topic)) return moveToNextStep();
      trace('sceneCue', { text: topic, source: 'asked', wallMs: Date.now() });
      scenes.ask(topic);
    },
    noteAhead(request, state) {
      if (state === 'settled') {
        lateWrites -= 1;
        if (!isStopped && !isHeld) fillAhead();
        return;
      }
      if (state === 'lateWrite') lateWrites += 1;
      const entry = entries.find((one) => sameWords(one.request, request));
      if (!entry) return;
      trace('sceneAhead', { text: request, state, wallMs: Date.now() });
      if (state === 'ready') {
        if (entry.state === 'making') entry.state = 'ready';
        return;
      }
      if (state === 'shown') entry.state = 'shown';
      else entries = entries.filter((other) => other !== entry);
      if (state === 'failed' || state === 'declined') givenUp.add(entry.request);
      if (state === 'declined' && entry.source === 'written') writesStarted -= 1;
      if (!isStopped && !isHeld) fillAhead();
    },
    noteStudentWords(words) {
      if (isAboutBeingUnsafe(words)) return stopForGood();
      isReplying = true;
      const wasHeld = isHeld;
      isHeld = MAY_BE_ABOUT_SAFETY.test(words);
      scenes.dropWaiting('studentTurn');
      if (isHeld) entries = entries.filter((entry) => entry.state !== 'due');
      if (wasHeld && !isHeld && !isStopped) fillAhead();
    },
    noteTutorReply({ spokenText, refusalCategory }) {
      isReplying = false;
      if (SAFETY_REPLY.test(spokenText) || (refusalCategory !== null && !PLAIN_REFUSALS.has(refusalCategory))) return stopForGood();
      if (isStopped || isHeld) return;
      askDue();
      fillAhead();
    },
    getPictureTopic() {
      if (!lesson || isStopped || isHeld || entries.some((entry) => entry.state === 'due' || entry.state === 'asked')) return null;
      const next = findEntry(lesson.stepIndex + 1);
      return next?.state === 'ready' ? next.request : null;
    },
    getEntries: () => entries,
  };
}
