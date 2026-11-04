import { type Beat, getBeatText, getSpokenWords, type ElementId, type SceneAgentMessage, type SceneBrowserMessage } from '@astra/contracts';
import { getSceneBeats } from '../scenes/lesson/lesson-beats.ts';
import { createLessonWork, type LessonWork } from '../scenes/lesson/lesson-work.ts';
import type { TopicRuns } from '../scenes/lesson/topic-runs.ts';
import { getSceneCommand, KIT_ASK_LIMIT_MS, SHOW_WINDOW_MS, type SceneState } from '../scenes/scene-desk.ts';
import { getSceneKey, type SceneStore } from '../scenes/scene-store.ts';
import type { LessonPlan, SceneFitReader, SceneRouter, StoredScene } from '../scenes/scene-types.ts';
import type { TutorBeat } from './brain.ts';

/** A take in the browser took 96 ms with the engine fetched, so this only covers a slow line. */
const PAGE_LOAD_LIMIT_MS = 6000;
/** The page gives a kit frame 15 s to build its scene, and a live scene has no 2D take to answer sooner, so it hears a little past that. */
const KIT_PAGE_LOAD_LIMIT_MS = 16_000;
const getPageLimitMs = ({ engine }: Pick<StoredScene, 'engine'>) => (engine === 'kit' ? KIT_PAGE_LOAD_LIMIT_MS : PAGE_LOAD_LIMIT_MS);
const MOST_ASKS_IN_A_SESSION = 6;
const MOST_TOPIC_CHARACTERS = 80;
const BREATH_MS = 300;
const RECHECK_PAUSE_MS = 500;
/** A scene later than this has lost its moment, whatever the student or the tutor is doing. A saved scene lands well inside it, and a fresh one on a quiet machine should take 20 to 25 s. */
export const ASK_LIMIT_MS = 35_000;
/** The greeting takes about 3 s, so a card's first words wait this long at most for a page that is slow to take the scene, and a reply starts at once when no scene is saved. */
const OPENING_WAIT_MS = 2500;

export interface TutorScenesOptions {
  router: SceneRouter;
  runs: TopicRuns;
  /** Writes 3D scenes live. Left out, a request the router sends to the kit gets no scene. */
  kitRuns?: TopicRuns;
  fitReader?: SceneFitReader;
  store: SceneStore;
  /** The library's title when this session came from a card. Only that title may share a scene. */
  getCardTitle(): string | null;
  getNowMs(): number;
  send(message: SceneAgentMessage): void;
  /** True only when the session took the beats, so a scene never talks over anyone. */
  speak(beats: readonly TutorBeat[]): boolean;
  canSpeak(): boolean;
  onShown(shown: { topic: string; beats: readonly Beat[]; isShared: boolean; studentId: string }): void;
  isClosed?(): boolean;
  /** One student looping a shared card spends the project's credits, so past their cap the scene does not play. */
  canPlayShared?(studentId: string): boolean;
  trace(name: string, fields?: Record<string, unknown>): void;
}

export interface TutorScenes {
  /** Never waits, and nothing a student could hear comes from it unless a scene lands. */
  ask(topic: string): void;
  onPage(message: SceneBrowserMessage, studentId: string): void;
  notePause(): void;
  noteCard(title: string | null): void;
  getOpeningScene(): Promise<readonly TutorBeat[] | null>;
  /** The student has moved on, so whatever was pending has lost its moment. A scene this turn wants comes from this turn's own ask. */
  noteStudentTurn(): void;
  /** A reply about a child's safety, so no scene talks after it until the student speaks again. */
  noteSafetyReply(): void;
  /** The lesson's title. A new one ends a picture of the old topic, and the same one told again to a reloaded page changes nothing. */
  noteTopic(title: string): void;
  notePageLink(isUp: boolean): void;
  waitForPicture(): Promise<boolean>;
  /** The student pressed End or left, so nothing more is asked or lands. A scene already on screen can still come back to a reloaded page. */
  close(): void;
}

type PageState = { kind: 'notAsked' } | { kind: 'away'; scene: StoredScene } | { kind: 'loading'; scene: StoredScene; limit: ReturnType<typeof setTimeout> } | { kind: 'loaded'; scene: StoredScene };

/** How an ask that lost its moment ended. What it made stays saved, so asking again is free. */
const MISSED_ITS_MOMENT: ReadonlySet<string> = new Set(['tooLate', 'studentTurn', 'replaced', 'pageTooSlow', 'topicChanged']);

interface SceneAsk {
  topic: string;
  work: LessonWork;
  askedAtMs: number;
  askLimit: ReturnType<typeof setTimeout>;
  windowLimit: ReturnType<typeof setTimeout> | null;
  recheck: ReturnType<typeof setTimeout> | null;
  page: PageState;
  isOpening: boolean;
  /** Written live in 3D. It takes longer than a student stays quiet, so a student's turn does not end it, and only its limit, a new topic, or a safety reply does. */
  isKit: boolean;
}

type Device = 'unknown' | 'canPlay' | 'cannotPlay';

type Opening = { kind: 'briefToCome' } | { kind: 'possible' } | { kind: 'over' };

const sameWords = (first: string, second: string) => first.trim().toLowerCase() === second.trim().toLowerCase();

const WORDS_NAMING_NO_TOPIC = new Set(['what', 'when', 'where', 'which', 'with', 'that', 'this', 'from', 'does', 'work', 'tell', 'your', 'about', 'really']);
const getTopicWords = (topic: string) => (topic.toLowerCase().match(/\p{L}{4,}/gu) ?? []).map((word) => word.replace(/s$/, '')).filter((word) => !WORDS_NAMING_NO_TOPIC.has(word));
const isSameTopic = (asked: string, title: string) => getTopicWords(asked).some((word) => getTopicWords(title).includes(word));

const getLoadMessage = ({ id, durationSeconds, engine }: StoredScene): SceneAgentMessage => ({ type: 'loadScene', sceneId: id, durationSeconds, ...(engine === 'kit' ? { engine } : {}) });

const getFirstMomentAfterStart = (moments: StoredScene['moments']) => Object.entries(moments).filter(([, seconds]) => seconds > 0).sort(([, first], [, second]) => first - second)[0]?.[0];

// The picture fades in on the setup's first word, and a take opens on an empty frame, so the setup line plays it on to its first later moment and the box is never blank under those words. A scene that opens a card ends on its narration, because the tutor's own first line follows it and asks.
export function getTutorSceneBeats({ plan, scene, number, endsOnQuestion = true }: { plan: LessonPlan; scene: StoredScene; number: number; endsOnQuestion?: boolean }): TutorBeat[] {
  const sceneCommand = getSceneCommand(scene, `scene-${number}` as ElementId);
  const beats = getSceneBeats({ setup: plan.setup, narration: plan.narration, scene: sceneCommand }).map((beat) => ({ ...beat, id: `n${number}-${beat.id}` as Beat['id'] }));
  const [first, ...rest] = beats.map((beat) => ({ ...beat, script: beat.script.filter((part) => typeof part === 'string' || part.kind !== 'richScene') }));
  if (!first) return [];
  const firstDrawn = getFirstMomentAfterStart(scene.moments);
  const startsDrawing: Beat['script'] = firstDrawn ? [{ kind: 'runSimulation', target: sceneCommand.id, action: 'play', until: firstDrawn, overWords: getSpokenWords(getBeatText(first)).length }] : [];
  const opening: TutorBeat = { ...first, script: [sceneCommand, { kind: 'boardMode', mode: 'teach' }, ...startsDrawing, ...first.script] };
  const close: TutorBeat = { id: `n${number}-close` as Beat['id'], script: [plan.close], expectsReply: true };
  return [opening, ...[...rest, ...(endsOnQuestion ? [close] : [])].map((beat) => ({ ...beat, pauseBeforeMs: BREATH_MS }))];
}

export function createTutorScenes({ router, runs, kitRuns, fitReader, store, getCardTitle, getNowMs, send, speak, canSpeak, onShown, isClosed = () => false, canPlayShared = () => true, trace }: TutorScenesOptions): TutorScenes {
  let device: Device = 'unknown';
  let studentId = '';
  let current: SceneAsk | null = null;
  let waitingForDevice: string | null = null;
  let scenesShown = 0;
  let asksMade = 0;
  let hasHadStudentTurn = false;
  let isAfterSafetyReply = false;
  let isOver = false;
  let lessonTitle: string | null = null;
  // The planner answers beside the reply, so a reply already being written has not heard the new title.
  let isTitleUnheard = false;
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
    const { scene: loaded } = ask.page;
    // A person can flag a scene in the seconds between the page loading it and the pause it lands at.
    if (store.isFlagged({ id: loaded.id, topic: loaded.topic, ownerId: loaded.ownerId })) return end(ask, 'flagged');
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
    const limit = setTimeout(() => end(ask, 'pageTooSlow'), getPageLimitMs(scene));
    ask.page = { kind: 'loading', scene, limit };
    send(getLoadMessage(scene));
  };

  const keepAskForKit = (ask: SceneAsk) => {
    ask.isKit = true;
    clearTimeout(ask.askLimit);
    if (ask.windowLimit) clearTimeout(ask.windowLimit);
    ask.windowLimit = null;
    ask.askLimit = setTimeout(() => end(ask, 'tooLate'), KIT_ASK_LIMIT_MS - (getNowMs() - ask.askedAtMs));
  };

  const onDeskChange = (ask: SceneAsk, state: SceneState) => {
    trace('sceneState', { state: state.kind, afterMs: Math.round(getNowMs() - ask.askedAtMs), ...(state.kind === 'failed' ? { reasons: state.reasons } : {}) });
    // A scene that comes after its window stays saved for the next ask, and this session has moved on.
    if (ask !== current) return;
    if ((state.kind === 'making' && state.route.engine === 'kit') || (state.kind === 'ready' && state.scene.engine === 'kit' && !ask.isKit)) keepAskForKit(ask);
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
    const work = createLessonWork({ router, runs, ...(kitRuns ? { kitRuns } : {}), ...(fitReader ? { fitReader } : {}), store, request: isCard ? cardTitle : topic, isCard, studentId, getNowMs, isOnlyForScene: true, onChange: (state) => onDeskChange(ask, state) });
    const ask: SceneAsk = { topic, work, askedAtMs: getNowMs(), askLimit: setTimeout(() => end(ask, 'tooLate'), ASK_LIMIT_MS), windowLimit: null, recheck: null, page: { kind: 'notAsked' }, isOpening: isCard && opening.kind === 'possible', isKit: false };
    works.push(work);
    current = ask;
    trace('sceneAsked', { text: topic, isCard });
    work.desk.ask(work.request);
  };

  const ask = (topic: string) => {
    const key = topic.trim().toLowerCase();
    if (isOver || device === 'cannotPlay' || isAfterSafetyReply || isClosed() || key === '' || topic.length > MOST_TOPIC_CHARACTERS || askedTopics.has(key) || asksMade >= MOST_ASKS_IN_A_SESSION) return;
    if (isTitleUnheard && lessonTitle !== null && !isSameTopic(topic, lessonTitle)) return trace('sceneOffTopic', { text: topic });
    if (current) end(current, 'replaced');
    if (waitingForDevice !== null) askedTopics.delete(waitingForDevice.trim().toLowerCase());
    askedTopics.add(key);
    waitingForDevice = null;
    if (device === 'unknown') waitingForDevice = topic;
    else start(topic);
  };

  const bringPictureBack = () => {
    if (onScreen) send(getLoadMessage(onScreen));
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
      if (!pending.windowLimit && !pending.isKit) {
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
      isTitleUnheard = false;
      // A card's title reaches the tutor as the first turn, and that turn is what asked.
      if (isFirstTurn && (current?.isOpening || opening.kind !== 'over')) return;
      if (waitingForDevice !== null) askedTopics.delete(waitingForDevice.trim().toLowerCase());
      waitingForDevice = null;
      if (current && !current.isKit) end(current, 'studentTurn');
    },
    noteSafetyReply() {
      isAfterSafetyReply = true;
      waitingForDevice = null;
      if (current) end(current, 'safetyReply');
      if (opening.kind !== 'over') giveOpening(null);
    },
    noteTopic(title) {
      if (lessonTitle !== null && sameWords(lessonTitle, title)) return;
      lessonTitle = title;
      isTitleUnheard = true;
      if (waitingForDevice !== null && !isSameTopic(waitingForDevice, title)) {
        askedTopics.delete(waitingForDevice.trim().toLowerCase());
        waitingForDevice = null;
      }
      if (current && !isSameTopic(current.topic, title)) end(current, 'topicChanged');
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
      const showing = onScreen;
      if (!showing) return Promise.resolve(true);
      return new Promise((resolve) => {
        const limit = setTimeout(() => {
          pictureWaits.delete(settle);
          resolve(false);
        }, getPageLimitMs(showing));
        const settle = (isBack: boolean) => {
          clearTimeout(limit);
          resolve(isBack);
        };
        pictureWaits.add(settle);
        bringPictureBack();
      });
    },
    close() {
      isOver = true;
      waitingForDevice = null;
      if (current) end(current, 'studentLeft');
      giveOpening(null);
      settlePictureWaits(false);
      for (const work of works.splice(0)) work.leave();
    },
  };
}

export const getSpokenCharacters = (beats: readonly Beat[]) => beats.map(getBeatText).join(' ').length;
