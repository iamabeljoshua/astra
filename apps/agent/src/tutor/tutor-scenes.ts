import { type Beat, getBeatText, type ElementId, type SceneAgentMessage, type SceneBrowserMessage } from '@astra/contracts';
import { getSceneBeats } from '../scenes/lesson/lesson-beats.ts';
import { createLessonWork, type LessonWork } from '../scenes/lesson/lesson-work.ts';
import type { TopicRuns } from '../scenes/lesson/topic-runs.ts';
import { getSceneCommand, SHOW_WINDOW_MS, type SceneState } from '../scenes/scene-desk.ts';
import { getSceneKey, type SceneStore } from '../scenes/scene-store.ts';
import type { LessonPlan, SceneRouter, StoredScene } from '../scenes/scene-types.ts';
import type { TutorBeat } from './brain.ts';

/** A take in the browser took 96 ms with the engine fetched, so this only covers a slow line. */
const PAGE_LOAD_LIMIT_MS = 6000;
const MOST_ASKS_IN_A_SESSION = 6;
const MOST_TOPIC_CHARACTERS = 80;
const BREATH_MS = 300;
const RECHECK_PAUSE_MS = 500;
/** A scene later than this has lost its moment, whatever the student or the tutor is doing. A saved scene lands well inside it, and a fresh one on a quiet machine takes 20 to 25 s. */
export const ASK_LIMIT_MS = 35_000;
/** The greeting takes about 3 s, so a card's first words wait this long at most for a page that is slow to take the scene, and a reply starts at once when no scene is saved. */
const OPENING_WAIT_MS = 2500;

export interface TutorScenesOptions {
  router: SceneRouter;
  runs: TopicRuns;
  store: SceneStore;
  /** The library's title when this session came from a card. Only that title may share a scene. */
  getCardTitle(): string | null;
  getNowMs(): number;
  send(message: SceneAgentMessage): void;
  /** True only when the session took the beats, so a scene never talks over anyone. */
  speak(beats: readonly TutorBeat[]): boolean;
  canSpeak(): boolean;
  onShown(shown: { topic: string; beats: readonly Beat[]; isShared: boolean; studentId: string }): void;
  /** A closed tutor says nothing more, and a scene counts. */
  isClosed?(): boolean;
  /** One student looping a shared card spends the project's credits, so past their cap the scene does not play. */
  canPlayShared?(studentId: string): boolean;
  trace(name: string, fields?: Record<string, unknown>): void;
}

export interface TutorScenes {
  /** Never waits, and nothing a student could hear comes from it unless a scene lands. */
  ask(topic: string): void;
  onPage(message: SceneBrowserMessage, studentId: string): void;
  /** The tutor has stopped talking, so the window opens, and a scene already loaded can land. */
  notePause(): void;
  /** The brief has come. A card with a saved scene asks at once from its title. */
  noteCard(title: string | null): void;
  /** The first reply's wait. Beats mean the session opens on the scene, and the tutor's first line follows them. */
  getOpeningScene(): Promise<readonly TutorBeat[] | null>;
  /** The student has moved on, so whatever was pending has lost its moment. A scene this turn wants comes from this turn's own ask. */
  noteStudentTurn(): void;
  /** A reply about a child's safety, so no scene talks after it until the student speaks again. */
  noteSafetyReply(): void;
  notePageLink(isUp: boolean): void;
  /** Words never play without their picture, so after a drop the page is asked again. False means the picture is not coming. */
  waitForPicture(): Promise<boolean>;
  close(): void;
}

type PageState = { kind: 'notAsked' } | { kind: 'away'; scene: StoredScene } | { kind: 'loading'; scene: StoredScene; limit: ReturnType<typeof setTimeout> } | { kind: 'loaded'; scene: StoredScene };

/** How an ask that lost its moment ended. What it made stays saved, so asking again is free. */
const MISSED_ITS_MOMENT: ReadonlySet<string> = new Set(['tooLate', 'studentTurn', 'replaced', 'pageTooSlow']);

interface SceneAsk {
  topic: string;
  work: LessonWork;
  askedAtMs: number;
  askLimit: ReturnType<typeof setTimeout>;
  windowLimit: ReturnType<typeof setTimeout> | null;
  recheck: ReturnType<typeof setTimeout> | null;
  page: PageState;
  /** Asked from a card's title, so the first reply can open on it. */
  isOpening: boolean;
}

type Device = 'unknown' | 'canPlay' | 'cannotPlay';

type Opening = { kind: 'briefToCome' } | { kind: 'possible' } | { kind: 'over' };

const sameWords = (first: string, second: string) => first.trim().toLowerCase() === second.trim().toLowerCase();

// The picture goes first in the setup's own script, on its first word, so a student never hears about something they cannot see. A scene that opens a card ends on its narration, because the tutor's own first line follows it and asks.
export function getTutorSceneBeats({ plan, scene, number, endsOnQuestion = true }: { plan: LessonPlan; scene: StoredScene; number: number; endsOnQuestion?: boolean }): TutorBeat[] {
  const sceneCommand = getSceneCommand(scene, `scene-${number}` as ElementId);
  const beats = getSceneBeats({ setup: plan.setup, narration: plan.narration, scene: sceneCommand }).map((beat) => ({ ...beat, id: `n${number}-${beat.id}` as Beat['id'] }));
  const [first, ...rest] = beats.map((beat) => ({ ...beat, script: beat.script.filter((part) => typeof part === 'string' || part.kind !== 'richScene') }));
  if (!first) return [];
  const opening: TutorBeat = { ...first, script: [sceneCommand, { kind: 'boardMode', mode: 'teach' }, ...first.script] };
  const close: TutorBeat = { id: `n${number}-close` as Beat['id'], script: [plan.close], expectsReply: true };
  return [opening, ...[...rest, ...(endsOnQuestion ? [close] : [])].map((beat) => ({ ...beat, pauseBeforeMs: BREATH_MS }))];
}

export function createTutorScenes({ router, runs, store, getCardTitle, getNowMs, send, speak, canSpeak, onShown, isClosed = () => false, canPlayShared = () => true, trace }: TutorScenesOptions): TutorScenes {
  let device: Device = 'unknown';
  let studentId = '';
  let current: SceneAsk | null = null;
  let waitingForDevice: string | null = null;
  let scenesShown = 0;
  let asksMade = 0;
  let hasHadStudentTurn = false;
  let isAfterSafetyReply = false;
  let opening: Opening = { kind: 'briefToCome' };
  let settleOpening: ((beats: readonly TutorBeat[] | null) => void) | null = null;
  let onScreen: StoredScene | null = null;
  const pictureWaits = new Set<(isBack: boolean) => void>();
  const askedTopics = new Set<string>();
  const works: LessonWork[] = [];

  const giveOpening = (beats: readonly TutorBeat[] | null) => {
    opening = { kind: 'over' };
    settleOpening?.(beats);
    settleOpening = null;
  };

  const end = (ask: SceneAsk, how: string) => {
    if (ask !== current) return;
    clearTimeout(ask.askLimit);
    if (ask.windowLimit) clearTimeout(ask.windowLimit);
    if (ask.recheck) clearTimeout(ask.recheck);
    if (ask.page.kind === 'loading') clearTimeout(ask.page.limit);
    current = null;
    if (MISSED_ITS_MOMENT.has(how)) askedTopics.delete(ask.topic.trim().toLowerCase());
    if (ask.isOpening) giveOpening(null);
    trace('sceneEnded', { how, afterMs: Math.round(getNowMs() - ask.askedAtMs) });
  };

  const show = (ask: SceneAsk, scene: StoredScene, beats: readonly TutorBeat[]) => {
    onScreen = scene;
    onShown({ topic: ask.topic, beats, isShared: scene.ownerId === null, studentId });
    end(ask, 'landed');
  };

  const land = (ask: SceneAsk) => {
    if (ask !== current || ask.page.kind !== 'loaded') return;
    if (ask.recheck) clearTimeout(ask.recheck);
    if (isClosed()) return end(ask, 'tutorClosed');
    if (ask.isOpening) {
      if (!settleOpening) return;
      const scene = ask.work.desk.takeAtOpening();
      if (!scene) return end(ask, 'tooLate');
      const beats = getTutorSceneBeats({ plan: scene.plan, scene, number: (scenesShown += 1), endsOnQuestion: false });
      const give = settleOpening;
      ask.isOpening = false;
      settleOpening = null;
      opening = { kind: 'over' };
      show(ask, scene, beats);
      give(beats);
      return;
    }
    if (!canSpeak()) {
      ask.recheck = setTimeout(() => land(ask), RECHECK_PAUSE_MS);
      return;
    }
    const scene = ask.work.desk.takeReady();
    if (!scene) return end(ask, 'tooLate');
    const number = (scenesShown += 1);
    const beats = getTutorSceneBeats({ plan: scene.plan, scene, number });
    if (!speak(beats)) return end(ask, 'lostThePause');
    show(ask, scene, beats);
  };

  // A new page holds no take, whatever the old page said, so nothing lands until this one says it has it.
  const loadInPage = (ask: SceneAsk, scene: StoredScene) => {
    if (ask.page.kind === 'loading') clearTimeout(ask.page.limit);
    const limit = setTimeout(() => end(ask, 'pageTooSlow'), PAGE_LOAD_LIMIT_MS);
    ask.page = { kind: 'loading', scene, limit };
    send({ type: 'loadScene', sceneId: scene.id, durationSeconds: scene.durationSeconds });
  };

  const onDeskChange = (ask: SceneAsk, state: SceneState) => {
    trace('sceneState', { state: state.kind, afterMs: Math.round(getNowMs() - ask.askedAtMs) });
    // A scene that comes after its window stays saved for the next ask, and this session has moved on.
    if (ask !== current) return;
    if (state.kind === 'ready') loadInPage(ask, state.scene);
    if (state.kind === 'declined' || state.kind === 'failed') end(ask, state.kind);
  };

  const start = (topic: string) => {
    const cardTitle = getCardTitle();
    const isCard = cardTitle !== null && sameWords(cardTitle, topic);
    if (isCard && !canPlayShared(studentId)) {
      trace('sharedPlaysUsed');
      if (opening.kind === 'possible') giveOpening(null);
      return;
    }
    asksMade += 1;
    const ask: SceneAsk = { topic, askedAtMs: getNowMs(), askLimit: setTimeout(() => end(ask, 'tooLate'), ASK_LIMIT_MS), windowLimit: null, recheck: null, page: { kind: 'notAsked' }, isOpening: isCard && opening.kind === 'possible', work: undefined as unknown as LessonWork };
    ask.work = createLessonWork({ router, runs, store, request: isCard ? cardTitle : topic, isCard, studentId, getNowMs, isOnlyForScene: true, onChange: (state) => onDeskChange(ask, state) });
    works.push(ask.work);
    current = ask;
    trace('sceneAsked', { text: topic, isCard });
    ask.work.desk.ask(ask.work.request);
  };

  const ask = (topic: string) => {
    const key = topic.trim().toLowerCase();
    if (device === 'cannotPlay' || isAfterSafetyReply || isClosed() || key === '' || topic.length > MOST_TOPIC_CHARACTERS || askedTopics.has(key) || asksMade >= MOST_ASKS_IN_A_SESSION) return;
    if (current) end(current, 'replaced');
    if (waitingForDevice !== null) askedTopics.delete(waitingForDevice.trim().toLowerCase());
    askedTopics.add(key);
    waitingForDevice = null;
    if (device === 'unknown') waitingForDevice = topic;
    else start(topic);
  };

  const bringPictureBack = () => {
    if (onScreen) send({ type: 'loadScene', sceneId: onScreen.id, durationSeconds: onScreen.durationSeconds });
  };

  const settlePictureWaits = (isBack: boolean) => {
    for (const settle of pictureWaits) settle(isBack);
    pictureWaits.clear();
  };

  return {
    ask,
    onPage(message, fromStudentId) {
      if (message.type === 'sceneDevice') {
        device = message.canPlay ? 'canPlay' : 'cannotPlay';
        studentId = fromStudentId;
        const waiting = waitingForDevice;
        waitingForDevice = null;
        if (!message.canPlay) {
          if (opening.kind !== 'over' && !current) giveOpening(null);
          if (current) end(current, 'pageCannotPlay');
          return settlePictureWaits(false);
        }
        if (waiting !== null) start(waiting);
        else if (current && current.page.kind !== 'notAsked') loadInPage(current, current.page.scene);
        bringPictureBack();
        return;
      }
      if (message.type === 'sceneRefused' && message.sceneId === onScreen?.id) settlePictureWaits(false);
      if (message.type === 'sceneLoaded' && message.sceneId === onScreen?.id) settlePictureWaits(true);
      const pending = current;
      if (pending?.page.kind !== 'loading' || pending.page.scene.id !== message.sceneId) return;
      if (message.type === 'sceneRefused') return end(pending, 'refusedByPage');
      clearTimeout(pending.page.limit);
      pending.page = { kind: 'loaded', scene: pending.page.scene };
      land(pending);
    },
    notePause() {
      const pending = current;
      if (!pending) return;
      if (!pending.windowLimit) {
        // Starts the desk's own clock without taking the scene.
        void pending.work.desk.untilLastChance();
        pending.windowLimit = setTimeout(() => end(pending, 'tooLate'), SHOW_WINDOW_MS);
      }
      land(pending);
    },
    noteCard(title) {
      if (opening.kind !== 'briefToCome') return;
      if (title === null || device === 'cannotPlay' || isClosed() || !store.find(getSceneKey(title))) return giveOpening(null);
      opening = { kind: 'possible' };
      ask(title);
      if (!current && waitingForDevice === null) giveOpening(null);
    },
    getOpeningScene() {
      if (opening.kind === 'over') return Promise.resolve(null);
      return new Promise((resolve) => {
        const limit = setTimeout(() => {
          if (current?.isOpening) current.isOpening = false;
          giveOpening(null);
        }, OPENING_WAIT_MS);
        settleOpening = (beats) => {
          clearTimeout(limit);
          resolve(beats);
        };
        if (current) land(current);
      });
    },
    noteStudentTurn() {
      const isFirstTurn = !hasHadStudentTurn;
      hasHadStudentTurn = true;
      isAfterSafetyReply = false;
      // A card's title reaches the tutor as the first turn, and that turn is what asked.
      if (isFirstTurn && (current?.isOpening || opening.kind !== 'over')) return;
      if (waitingForDevice !== null) askedTopics.delete(waitingForDevice.trim().toLowerCase());
      waitingForDevice = null;
      if (current) end(current, 'studentTurn');
    },
    noteSafetyReply() {
      isAfterSafetyReply = true;
      waitingForDevice = null;
      if (current) end(current, 'safetyReply');
      if (opening.kind !== 'over') giveOpening(null);
    },
    notePageLink(isUp) {
      const pending = current;
      if (!pending || pending.page.kind === 'notAsked') return;
      if (isUp && pending.page.kind === 'away') return loadInPage(pending, pending.page.scene);
      if (!isUp) {
        if (pending.page.kind === 'loading') clearTimeout(pending.page.limit);
        pending.page = { kind: 'away', scene: pending.page.scene };
      }
    },
    waitForPicture() {
      if (!onScreen) return Promise.resolve(true);
      return new Promise((resolve) => {
        const limit = setTimeout(() => {
          pictureWaits.delete(settle);
          resolve(false);
        }, PAGE_LOAD_LIMIT_MS);
        const settle = (isBack: boolean) => {
          clearTimeout(limit);
          resolve(isBack);
        };
        pictureWaits.add(settle);
        bringPictureBack();
      });
    },
    close() {
      if (current) end(current, 'studentLeft');
      giveOpening(null);
      settlePictureWaits(false);
      for (const work of works) work.leave();
    },
  };
}

export const getSpokenCharacters = (beats: readonly Beat[]) => beats.map(getBeatText).join(' ').length;
