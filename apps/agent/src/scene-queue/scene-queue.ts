import { isAboutBeingUnsafe } from '../scenes/content-check.ts';
import type { LessonPlan, LessonStep } from '../lesson-plan/lesson-plan.ts';
import type { LessonState } from '../lesson-plan/plan-progress.ts';
import { MAY_BE_ABOUT_SAFETY, PLAIN_REFUSALS } from '../tutor/safety-words.ts';
import { type AheadFacts, getPrepareRefusal, getWriteRefusal } from './ahead-budget.ts';

/** A scene of a saved library costs nothing, and a written one costs a write, so the two follow different rules. */
export type SceneSource = 'library' | 'written';
export type EntryState = 'making' | 'ready' | 'due' | 'shown';

export interface QueueEntry {
  request: string;
  lessonTopic: string;
  stepIndex: number;
  source: SceneSource;
  state: EntryState;
}

/** The part of the scene desk the queue drives, so a turn never waits on any of it. */
export interface QueueScenes {
  /** False when this session has no use for it, such as a scene it has already shown. */
  prepare(request: string): boolean;
  ask(request: string): void;
  dropPrepared(request: string): void;
  dropWaiting(how: 'movedOn' | 'switched'): void;
  stop(): void;
}

export interface SceneQueueOptions {
  scenes: QueueScenes;
  /** The library's scene for each step, or null, and a failed read means none. */
  readLibrary(plan: LessonPlan): Promise<readonly (string | null)[]>;
  getFacts(): AheadFacts;
  canPlay(): boolean;
  /** The tutor went to the next idea on its own, ahead of any exercise. */
  moveToNextStep(): void;
  trace(name: string, fields?: Record<string, unknown>): void;
}

export interface SceneQueue {
  onLesson(state: LessonState): void;
  onPageReady(): void;
  onTutorAsk(topic: string): void;
  noteAhead(request: string, state: 'ready' | 'shown' | 'gone'): void;
  noteStudentWords(words: string): void;
  noteTutorReply(reply: { spokenText: string; refusalCategory: string | null }): void;
  /** The next idea's picture, once it can land, so the tutor can ask for it by name. */
  getReadyPicture(): string | null;
  getEntries(): readonly QueueEntry[];
}

const MOST_REQUEST_CHARACTERS = 80;
/** What the tutor's own rules have it say in a crisis, the one sign of a safety reply that code can read. */
const SAFETY_REPLY = /\b(local emergency number|that sounds serious|you did the right thing telling me)\b/i;

const sameWords = (first: string, second: string) => first.trim().toLowerCase() === second.trim().toLowerCase();

// A step's words lean on the lesson around them, and a writer sees only this line.
function toRequest(lessonTopic: string, teach: string): string {
  const words = `${lessonTopic}: ${teach}`;
  if (words.length <= MOST_REQUEST_CHARACTERS) return words;
  return words.slice(0, words.lastIndexOf(' ', MOST_REQUEST_CHARACTERS));
}

// A written scene needs an idea to draw. A step with only an exercise gets a saved scene or none, because a picture could give away what the student is about to work out.
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
  let writesStarted = 0;
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
      trace('sceneAheadRefused', { refusal, source: wanted.source, stepIndex });
      return null;
    }
    if (!scenes.prepare(wanted.request)) return null;
    if (wanted.source === 'written') writesStarted += 1;
    const entry: QueueEntry = { ...wanted, lessonTopic: lesson.plan.topic, stepIndex, state: 'making' };
    entries = [...entries, entry];
    trace('sceneAheadStarted', { text: entry.request, source: entry.source, stepIndex, wallMs: Date.now() });
    return entry;
  };

  const isMakingWrite = () => entries.some((entry) => entry.source === 'written' && (entry.state === 'making' || entry.state === 'due'));

  const fillAhead = () => {
    if (!lesson) return;
    const nextIndex = lesson.stepIndex + 1;
    if (findEntry(nextIndex)) return;
    const title = getLibrary(lesson.plan.topic)?.[nextIndex];
    if (!title && isMakingWrite()) return;
    startEntry(nextIndex);
  };

  const makeDue = (entry: QueueEntry) => {
    entry.state = 'due';
    trace('sceneCue', { text: entry.request, source: entry.source, stepIndex: entry.stepIndex, wallMs: Date.now() });
    scenes.ask(entry.request);
  };

  // A saved scene for the step the lesson is on costs nothing, so it can start here. A write for this step would come too late.
  const reachStep = () => {
    if (!lesson) return;
    const { stepIndex, plan } = lesson;
    const known = findEntry(stepIndex);
    if (known?.state === 'due' || known?.state === 'shown') return;
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
    scenes.stop();
    trace('sceneAheadStopped');
  };

  return {
    onLesson({ active }) {
      if (!active) return;
      const wasTopic = lesson?.plan.topic ?? null;
      const wasStep = lesson?.stepIndex ?? null;
      lesson = { plan: active.plan, stepIndex: active.stepIndex };
      if (isStopped) return;
      const isSwitch = wasTopic !== active.plan.topic;
      if (isSwitch && wasTopic !== null) scenes.dropWaiting('switched');
      if (!isSwitch && wasStep !== active.stepIndex) scenes.dropWaiting('movedOn');
      dropPassed();
      startLibraryRead(active.plan);
      if (isSwitch || wasStep !== active.stepIndex) reachStep();
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
      const entry = entries.find((one) => sameWords(one.request, request));
      if (!entry) return;
      if (state === 'gone') entries = entries.filter((other) => other !== entry);
      else if (state === 'shown' || entry.state !== 'due') entry.state = state;
      trace('sceneAhead', { text: request, state, wallMs: Date.now() });
      if (state === 'shown' && !isStopped && !isHeld) fillAhead();
    },
    noteStudentWords(words) {
      if (isAboutBeingUnsafe(words)) return stopForGood();
      const wasHeld = isHeld;
      isHeld = MAY_BE_ABOUT_SAFETY.test(words);
      if (isHeld) {
        scenes.dropWaiting('movedOn');
        entries = entries.filter((entry) => entry.state !== 'due');
      }
      if (wasHeld && !isHeld && !isStopped) fillAhead();
    },
    noteTutorReply({ spokenText, refusalCategory }) {
      if (SAFETY_REPLY.test(spokenText) || (refusalCategory !== null && !PLAIN_REFUSALS.has(refusalCategory))) stopForGood();
      else if (!isStopped) fillAhead();
    },
    getReadyPicture() {
      if (!lesson || isStopped || isHeld) return null;
      const next = findEntry(lesson.stepIndex + 1);
      return next?.state === 'ready' ? next.request : null;
    },
    getEntries: () => entries,
  };
}
