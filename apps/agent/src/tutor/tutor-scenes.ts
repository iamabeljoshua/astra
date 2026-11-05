import { type Beat, getBeatText, getSpokenWords, type ElementId, type SceneAgentMessage, type SceneBrowserMessage, type SceneCommand } from '@astra/contracts';
import { getSceneBeats } from '../scenes/lesson/lesson-beats.ts';
import { createLessonWork } from '../scenes/lesson/lesson-work.ts';
import type { SceneWork, SceneWorkInput } from '../scenes/recipe/recipe-work.ts';
import type { SceneSpeech } from '../scenes/live-words/check-speech.ts';
import type { LiveSceneWords } from '../scenes/live-words/live-scene-words.ts';
import type { TopicRuns } from '../scenes/lesson/topic-runs.ts';
import { getSceneCommand, KIT_ASK_LIMIT_MS, SHOW_WINDOW_MS, type SceneState } from '../scenes/scene-desk.ts';
import { getSceneKey, type SceneStore } from '../scenes/scene-store.ts';
import type { SceneFitReader, SceneRouter, StoredScene } from '../scenes/scene-types.ts';
import type { AheadNews } from '../scene-queue/scene-queue.ts';
import type { SceneHeard } from '../live/live-session.ts';
import type { TutorBeat } from './brain.ts';
import { dropAllWordsLeft, EMPTY_SCREEN, getReplacedSceneCommands, isSameTopic, noteLessonTitle, noteSceneLanded, noteSceneWordsCut, noteStudentTurnAway, takeOwedCommands, takeWordsLeft } from './scene-screen.ts';

/** A take in the browser took 96 ms with the engine fetched, so this only covers a slow line. */
const PAGE_LOAD_LIMIT_MS = 6000;
/** The page gives a kit frame 15 s to build, and a live scene has no 2D take to answer sooner, so this hears a little past that. */
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
export const LIVE_WORDS_WAIT_MS = 1500;
const EARLY_PICTURE_HOLD_MS = 2500;

export interface FastSceneHooks {
  makeWork(input: SceneWorkInput): SceneWork;
  canCutIn(): boolean;
  isInBreath(): boolean;
  /** The reply has said nothing yet, so a picture ready now can be the lesson's first teaching and no sentence is cut. */
  isBeforeFirstWord?(): boolean;
  cutIn(beats: readonly TutorBeat[]): boolean;
  mostAsks: number;
  askLimitMs: number;
}

export interface TutorScenesOptions {
  router: SceneRouter;
  runs: TopicRuns;
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
  onAhead?(request: string, news: AheadNews): void;
  onPageReady?(): void;
  trace(name: string, fields?: Record<string, unknown>): void;
  fast?: FastSceneHooks;
  liveWords?: LiveSceneWords;
}

export interface TutorScenes {
  /** Never waits, and nothing a student could hear comes from it unless a scene lands. False when the ask was refused. */
  ask(topic: string): boolean;
  prepare(request: string): boolean;
  dropPrepared(request: string): void;
  dropWaiting(how: 'movedOn' | 'switched' | 'studentTurn'): void;
  stopForGood(): void;
  canPlay(): boolean;
  onPage(message: SceneBrowserMessage, studentId: string): void;
  notePause(): void;
  noteCard(title: string | null): void;
  /** The API names a typed question when the room opens, so its picture starts at the press and is ready when the page joins. */
  noteEarlyQuestion(question: string, forStudentId: string): void;
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
  noteSentenceBreak(): void;
  noteWordsSettled(sceneId: string): void;
  /** The greeting has ended, and a reply's first word can be on its way, so a picture that is ready goes now. */
  noteReactionOver(): void;
  holdFirstWord(): Promise<void>;
  noteSceneCut(heard: SceneHeard): void;
  takeOwedCommands(): readonly SceneCommand[];
}

type PageState = { kind: 'notAsked' } | { kind: 'away'; scene: StoredScene } | { kind: 'loading'; scene: StoredScene; limit: ReturnType<typeof setTimeout> } | { kind: 'loaded'; scene: StoredScene };

/** How an ask that lost its moment ended. What it made stays saved, so asking again is free. */
const MISSED_ITS_MOMENT: ReadonlySet<string> = new Set(['tooLate', 'studentTurn', 'replaced', 'pageTooSlow', 'movedOn', 'topicChanged']);

interface SceneAsk {
  topic: string;
  work: SceneWork;
  askedAtMs: number;
  askLimit: ReturnType<typeof setTimeout> | null;
  windowLimit: ReturnType<typeof setTimeout> | null;
  recheck: ReturnType<typeof setTimeout> | null;
  page: PageState;
  isAhead: boolean;
  isOpening: boolean;
  canLandOnSentence: boolean;
  heldForWordsSinceMs: number | null;
  /** Asked from the student's own question before the page joined, so the opening line that follows is not a new turn. */
  isEarly: boolean;
  /** Written live in 3D, which takes longer than a student stays quiet, so a student's turn does not end it. */
  isKit: boolean;
}

type Device = 'unknown' | 'canPlay' | 'cannotPlay';

type Opening = { kind: 'briefToCome' } | { kind: 'possible' } | { kind: 'over' };

const sameWords = (first: string, second: string) => first.trim().toLowerCase() === second.trim().toLowerCase();

const getEngineField = ({ engine }: StoredScene) => (engine === 'kit' || engine === 'canvas' ? { engine } : {});
const getLoadMessage = (scene: StoredScene): SceneAgentMessage => ({ type: 'loadScene', sceneId: scene.id, durationSeconds: scene.durationSeconds, ...getEngineField(scene) });
const getPrepareMessage = (scene: StoredScene): SceneAgentMessage => ({ type: 'prepareScene', sceneId: scene.id, ...getEngineField(scene) });

const getFirstMomentAfterStart = (moments: StoredScene['moments']) => Object.entries(moments).filter(([, seconds]) => seconds > 0).sort(([, first], [, second]) => first - second)[0]?.[0];

// The picture fades in on the setup's first word, and a take opens on an empty frame, so the setup line plays it on to its first later moment and the box is never blank under those words. A scene that opens a card ends on its narration, because the tutor's own first line follows it and asks.
export function getTutorSceneBeats({ plan, scene, number, endsOnQuestion = true, firstCommands = [] }: { plan: SceneSpeech; scene: StoredScene; number: number; endsOnQuestion?: boolean; firstCommands?: readonly SceneCommand[] }): TutorBeat[] {
  const sceneCommand = getSceneCommand(scene, `scene-${number}` as ElementId);
  const beats = getSceneBeats({ setup: plan.setup, narration: plan.narration, scene: sceneCommand }).map((beat) => ({ ...beat, id: `n${number}-${beat.id}` as Beat['id'] }));
  const [first, ...rest] = beats.map((beat) => ({ ...beat, script: beat.script.filter((part) => typeof part === 'string' || part.kind !== 'richScene') }));
  if (!first) return [];
  const firstDrawn = getFirstMomentAfterStart(scene.moments);
  const startsDrawing: Beat['script'] = firstDrawn ? [{ kind: 'runSimulation', target: sceneCommand.id, action: 'play', until: firstDrawn, overWords: getSpokenWords(getBeatText(first)).length }] : [];
  const opening: TutorBeat = { ...first, script: [...firstCommands, sceneCommand, { kind: 'boardMode', mode: 'teach' }, ...startsDrawing, ...first.script] };
  if (scene.recipe) return [opening, ...rest];
  const close: TutorBeat = { id: `n${number}-close` as Beat['id'], script: [plan.close], expectsReply: true };
  return [opening, ...[...rest, ...(endsOnQuestion ? [close] : [])].map((beat) => ({ ...beat, pauseBeforeMs: BREATH_MS }))];
}

export function createTutorScenes({ router, runs, kitRuns, fitReader, store, getCardTitle, getNowMs, send, speak, canSpeak, onShown, onAhead, onPageReady, isClosed = () => false, canPlayShared = () => true, trace, fast, liveWords }: TutorScenesOptions): TutorScenes {
  let device: Device = 'unknown';
  let canPlayTakes = true;
  let canDrawRecipes = true;
  let screen = EMPTY_SCREEN;
  let wordsLeftRecheck: ReturnType<typeof setTimeout> | null = null;
  let studentId = '';
  let current: SceneAsk | null = null;
  let waitingForDevice: string | null = null;
  let scenesShown = 0;
  let isStopped = false;
  let asksMade = 0;
  let hasHadStudentTurn = false;
  let isAfterSafetyReply = false;
  let lessonTitle: string | null = null;
  // The planner answers beside the reply, so a reply already being written has not heard the new title.
  let isTitleUnheard = false;
  let opening: Opening = { kind: 'briefToCome' };
  let settleOpening: ((beats: readonly TutorBeat[] | null) => void) | null = null;
  let onScreen: StoredScene | null = null;
  const pictureWaits = new Set<(isBack: boolean) => void>();
  const askedTopics = new Set<string>();
  const prepared = new Map<string, SceneAsk>();
  const shownSceneIds = new Set<string>();
  const works: SceneWork[] = [];
  let wordCuts = 0;
  let endEarlyHold = () => {};
  let hasHeldFirstWord = false;

  const toKey = (topic: string) => topic.trim().toLowerCase();

  const lateWrites = new Set<SceneAsk>();

  const getNewsOfEnding = (ask: SceneAsk, how: string): AheadNews => {
    if (how === 'declined' || how === 'failed') return how;
    const { kind } = ask.work.desk.getState();
    if (kind !== 'routing' && kind !== 'making') return 'missed';
    lateWrites.add(ask);
    return 'lateWrite';
  };

  const giveOpening = (beats: readonly TutorBeat[] | null) => {
    opening = { kind: 'over' };
    settleOpening?.(beats);
    settleOpening = null;
  };

  const end = (ask: SceneAsk, how: string) => {
    if (ask !== current) return;
    if (ask.isEarly) endEarlyHold();
    if (ask.askLimit) clearTimeout(ask.askLimit);
    if (ask.windowLimit) clearTimeout(ask.windowLimit);
    if (ask.recheck) clearTimeout(ask.recheck);
    if (ask.page.kind === 'loading') clearTimeout(ask.page.limit);
    current = null;
    if (MISSED_ITS_MOMENT.has(how)) askedTopics.delete(toKey(ask.topic));
    if (ask.isOpening) giveOpening(null);
    if (ask.isAhead && how !== 'landed') {
      const news = getNewsOfEnding(ask, how);
      onAhead?.(ask.topic, news);
    }
    trace('sceneEnded', { how, afterMs: Math.round(getNowMs() - ask.askedAtMs) });
  };

  const getSpeech = (scene: StoredScene): { speech: SceneSpeech; isLive: boolean } => {
    const words = liveWords?.read(scene.id);
    return words?.kind === 'live' ? { speech: words.speech, isLive: true } : { speech: scene.plan, isLive: false };
  };

  // An early picture lands before the reply's first word is heard, so there is nothing to carry on from.
  const startWords = (ask: SceneAsk, scene: StoredScene) => liveWords?.startOnce(scene, { askedAbout: ask.topic, canWaitForFirstWords: !ask.isEarly });

  const holdForWords = (ask: SceneAsk, scene: StoredScene) => {
    if (liveWords?.read(scene.id).kind !== 'writing') return false;
    ask.heldForWordsSinceMs ??= getNowMs();
    const leftMs = LIVE_WORDS_WAIT_MS - (getNowMs() - ask.heldForWordsSinceMs);
    if (leftMs <= 0) return false;
    if (ask.recheck) clearTimeout(ask.recheck);
    ask.recheck = setTimeout(() => land(ask), leftMs);
    return true;
  };

  const show = (ask: SceneAsk, scene: StoredScene, beats: readonly TutorBeat[], isLive: boolean) => {
    if (liveWords) trace('sceneWordsLanded', { words: isLive ? 'live' : 'saved', heldMs: ask.heldForWordsSinceMs === null ? 0 : Math.round(getNowMs() - ask.heldForWordsSinceMs) });
    onScreen = scene;
    if (fast) screen = noteSceneLanded(screen, { scene, elementId: `scene-${scenesShown}` as ElementId, lessonTitle, beats });
    shownSceneIds.add(scene.id);
    onShown({ topic: ask.topic, beats, isShared: scene.ownerId === null && !isLive, studentId });
    end(ask, 'landed');
  };

  const getSceneWaiting = ({ isAhead, page, work }: SceneAsk): StoredScene | null => {
    if (page.kind === 'loaded') return page.scene;
    const state = work.desk.getState();
    return isAhead && page.kind === 'notAsked' && state.kind === 'ready' ? state.scene : null;
  };

  const land = (ask: SceneAsk, at: 'pause' | 'sentence' = 'pause') => {
    const waiting = getSceneWaiting(ask);
    if (ask !== current || !waiting) return;
    if (ask.recheck) clearTimeout(ask.recheck);
    if (isClosed()) return end(ask, 'tutorClosed');
    if (store.isFlagged({ id: waiting.id, topic: waiting.topic, ownerId: waiting.ownerId })) return end(ask, 'flagged');
    if (waiting.ownerId === null && !canPlayShared(studentId)) return end(ask, 'sharedPlaysUsed');
    if (ask.isOpening) {
      if (!settleOpening || holdForWords(ask, waiting)) return;
      const scene = ask.work.desk.takeAtOpening();
      if (!scene) return end(ask, 'tooLate');
      const { speech, isLive } = getSpeech(scene);
      const beats = getTutorSceneBeats({ plan: speech, scene, number: (scenesShown += 1), endsOnQuestion: false });
      const give = settleOpening;
      ask.isOpening = false;
      settleOpening = null;
      opening = { kind: 'over' };
      show(ask, scene, beats, isLive);
      give(beats);
      return;
    }
    const isFirstReplyUnspoken = ask.isEarly && fast?.isBeforeFirstWord?.() === true;
    const cutIn = (at === 'sentence' || fast?.isInBreath() || isFirstReplyUnspoken) && ask.canLandOnSentence ? fast : undefined;
    if (cutIn ? !cutIn.canCutIn() : !canSpeak()) {
      if (at === 'pause') ask.recheck = setTimeout(() => land(ask), RECHECK_PAUSE_MS);
      return;
    }
    if (ask.page.kind === 'notAsked') return loadInPage(ask, waiting);
    if (holdForWords(ask, waiting)) return;
    const scene = ask.work.desk.takeReady();
    if (!scene) return end(ask, 'tooLate');
    if (shownSceneIds.has(scene.id)) return end(ask, 'alreadyShown');
    const number = (scenesShown += 1);
    const { speech, isLive } = getSpeech(scene);
    const beats = getTutorSceneBeats({ plan: speech, scene, number, ...(fast ? { firstCommands: getReplacedSceneCommands(screen) } : {}) });
    if (!(cutIn ? cutIn.cutIn(beats) : speak(beats))) return end(ask, 'lostThePause');
    show(ask, scene, beats, isLive);
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
    if (ask.askLimit) clearTimeout(ask.askLimit);
    if (ask.windowLimit) clearTimeout(ask.windowLimit);
    ask.windowLimit = null;
    ask.askLimit = setTimeout(() => end(ask, 'tooLate'), KIT_ASK_LIMIT_MS - (getNowMs() - ask.askedAtMs));
  };

  const forgetPrepared = (ask: SceneAsk, news: AheadNews) => {
    prepared.delete(toKey(ask.topic));
    onAhead?.(ask.topic, news);
  };

  const onDeskChange = (ask: SceneAsk, state: SceneState) => {
    trace('sceneState', { state: state.kind, afterMs: Math.round(getNowMs() - ask.askedAtMs), ...(state.kind === 'failed' ? { reasons: state.reasons } : {}), ...(state.kind === 'making' ? { engine: state.route.engine, kind: state.route.kind, topic: state.route.topic } : {}) });
    if (prepared.get(toKey(ask.topic)) === ask) {
      if (state.kind === 'ready' && shownSceneIds.has(state.scene.id)) forgetPrepared(ask, 'declined');
      else if (state.kind === 'ready') send(getPrepareMessage(state.scene));
      if (state.kind === 'declined' || state.kind === 'failed') forgetPrepared(ask, state.kind);
      return;
    }
    // A scene that comes after its window stays saved for the next ask, and this session has moved on.
    if (ask !== current) {
      if (state.kind !== 'routing' && state.kind !== 'making' && lateWrites.delete(ask)) onAhead?.(ask.topic, 'settled');
      return;
    }
    if (!fast && ((state.kind === 'making' && state.route.engine === 'kit') || (state.kind === 'ready' && state.scene.engine === 'kit' && !ask.isKit))) keepAskForKit(ask);
    if (state.kind === 'ready') startWords(ask, state.scene);
    if (state.kind === 'ready' && device !== 'unknown') loadInPage(ask, state.scene);
    if (state.kind === 'declined' || state.kind === 'failed') end(ask, state.kind);
  };

  const makeAsk = (topic: string, isAhead: boolean): SceneAsk | null => {
    const cardTitle = getCardTitle();
    const isCard = cardTitle !== null && sameWords(cardTitle, topic);
    if (isCard && !canPlayShared(studentId)) {
      trace('sharedPlaysUsed');
      if (opening.kind === 'possible') giveOpening(null);
      return null;
    }
    const request = isCard ? cardTitle : topic;
    const onChange = (state: SceneState) => onDeskChange(ask, state);
    // A live 3D scene is paid for only when a student is asking, so the queue never starts one.
    const work: SceneWork = fast
      ? fast.makeWork({ request, isCard, studentId, canPlayTakes, canDrawRecipes, canWriteLive: !isAhead, onLiveWrite: () => keepAskForKit(ask), getNowMs, onChange })
      : createLessonWork({ router, runs, ...(kitRuns && !isAhead ? { kitRuns } : {}), ...(fitReader && !isAhead ? { fitReader } : {}), store, request, isCard, studentId, getNowMs, isOnlyForScene: true, onChange });
    const ask: SceneAsk = { topic, work, askedAtMs: getNowMs(), askLimit: null, windowLimit: null, recheck: null, page: { kind: 'notAsked' }, isAhead, isOpening: isCard && !isAhead && opening.kind === 'possible', canLandOnSentence: true, heldForWordsSinceMs: null, isEarly: false, isKit: false };
    works.push(work);
    trace('sceneAsked', { text: topic, isCard, isAhead });
    return ask;
  };

  const startClock = (ask: SceneAsk) => {
    if (!store.find(getSceneKey(ask.topic))) asksMade += 1;
    ask.askLimit = setTimeout(() => end(ask, 'tooLate'), fast?.askLimitMs ?? ASK_LIMIT_MS);
  };

  const start = (topic: string) => {
    const ask = makeAsk(topic, false);
    if (!ask) return false;
    startClock(ask);
    current = ask;
    ask.work.desk.ask(ask.work.request);
    return true;
  };

  const startPrepared = (ask: SceneAsk) => {
    prepared.delete(toKey(ask.topic));
    current = ask;
    ask.askedAtMs = getNowMs();
    startClock(ask);
    const state = ask.work.desk.getState();
    if (state.kind === 'ready') {
      startWords(ask, state.scene);
      land(ask);
    } else if (state.kind === 'declined' || state.kind === 'failed') end(ask, state.kind);
  };

  const sendPreparedAgain = () => {
    for (const ahead of prepared.values()) {
      const state = ahead.work.desk.getState();
      if (state.kind === 'ready') send(getPrepareMessage(state.scene));
    }
  };

  const onPrepared = (message: Extract<SceneBrowserMessage, { type: 'scenePrepared' | 'sceneRefused' }>) => {
    for (const ahead of prepared.values()) {
      const state = ahead.work.desk.getState();
      if (state.kind !== 'ready' || state.scene.id !== message.sceneId) continue;
      ahead.work.notePage?.(message.type === 'scenePrepared');
      if (message.type === 'sceneRefused') forgetPrepared(ahead, 'failed');
      else onAhead?.(ahead.topic, 'ready');
      return true;
    }
    return false;
  };

  // The limit stops a session that keeps asking for new writes. A saved scene pays only for its voice, and a student's plays a day cap that.
  const isPastTheAskLimit = (topic: string) => asksMade >= (fast?.mostAsks ?? MOST_ASKS_IN_A_SESSION) && !store.find(getSceneKey(topic));

  // A side question's own picture must not throw away a scene whose words are waiting to carry on.
  const isOverWordsLeft = (topic: string) => {
    const scene = screen.onScreen;
    return Boolean(fast && scene && scene.left.length > 0 && !prepared.has(toKey(topic)) && !isSameTopic(topic, scene.scene.topic));
  };

  const ask = (topic: string, isBeforeThePage = false) => {
    const key = toKey(topic);
    if (isStopped || device === 'cannotPlay' || isAfterSafetyReply || isClosed() || key === '' || topic.length > MOST_TOPIC_CHARACTERS || askedTopics.has(key) || isPastTheAskLimit(topic)) return false;
    if (isTitleUnheard && lessonTitle !== null && !prepared.has(key) && !isSameTopic(topic, lessonTitle)) {
      trace('sceneOffTopic', { text: topic });
      return false;
    }
    // The plan and the tutor often name one idea in two ways, and starting over would only make it later.
    if (fast && current && !current.isAhead && isSameTopic(topic, current.topic)) {
      trace('sceneAskPassed', { text: topic, why: 'sameIdea' });
      return true;
    }
    if (isOverWordsLeft(topic)) {
      trace('sceneAskPassed', { text: topic, why: 'wordsLeft' });
      return false;
    }
    if (current) end(current, 'replaced');
    if (waitingForDevice !== null) askedTopics.delete(waitingForDevice.trim().toLowerCase());
    askedTopics.add(key);
    waitingForDevice = null;
    const ahead = prepared.get(key);
    if (ahead) startPrepared(ahead);
    else if (device === 'unknown' && !isBeforeThePage) waitingForDevice = topic;
    else return start(topic);
    return true;
  };

  const bringPictureBack = () => {
    if (onScreen) send(getLoadMessage(onScreen));
  };

  const settlePictureWaits = (isBack: boolean) => {
    for (const settle of pictureWaits) settle(isBack);
    pictureWaits.clear();
  };

  const sayWordsLeft = () => {
    if (wordsLeftRecheck) clearTimeout(wordsLeftRecheck);
    wordsLeftRecheck = null;
    if (!fast || !screen.onScreen?.left.length || current || isClosed() || isStopped || isAfterSafetyReply) return;
    if (!canSpeak()) {
      wordsLeftRecheck = setTimeout(sayWordsLeft, RECHECK_PAUSE_MS);
      return;
    }
    const { scene } = screen.onScreen;
    const taken = takeWordsLeft(screen);
    if (!speak(taken.left)) return;
    screen = taken.screen;
    onShown({ topic: scene.topic, beats: taken.left, isShared: scene.ownerId === null, studentId });
  };

  const onNewLessonTitle = (title: string) => {
    const moved = noteLessonTitle(screen, title, `scene-${(scenesShown += 1)}` as ElementId);
    screen = moved.screen;
    if (moved.move.kind === 'back') {
      onScreen = moved.move.scene;
      send(getLoadMessage(moved.move.scene));
      return sayWordsLeft();
    }
    if (moved.move.kind === 'needsScene' && !current && ![...askedTopics].some((asked) => isSameTopic(asked, title))) ask(title);
  };

  return {
    ask,
    prepare(request) {
      const key = toKey(request);
      // The queue's titles were read once for the topic, so one can have been flagged since, and a flagged title has no saved scene and would pay for a new write.
      if (isStopped || isClosed() || device !== 'canPlay' || !canPlayShared(studentId) || store.isFlagged(getSceneKey(request)) || prepared.has(key) || askedTopics.has(key) || request.length > MOST_TOPIC_CHARACTERS || isPastTheAskLimit(request)) return false;
      const ahead = makeAsk(request, true);
      if (!ahead) return false;
      prepared.set(key, ahead);
      ahead.work.desk.ask(ahead.work.request);
      return true;
    },
    dropPrepared(request) {
      const ahead = prepared.get(toKey(request));
      if (!ahead) return;
      prepared.delete(toKey(request));
      ahead.work.leave();
    },
    dropWaiting(how) {
      if (how === 'switched') {
        for (const late of lateWrites) late.work.leave();
        return;
      }
      if (fast && how === 'studentTurn') return;
      if (current) end(current, how);
    },
    stopForGood() {
      isStopped = true;
      waitingForDevice = null;
      if (current) end(current, 'stopped');
      if (opening.kind !== 'over') giveOpening(null);
      for (const work of works.splice(0)) work.leave();
      prepared.clear();
    },
    canPlay: () => !isStopped && device === 'canPlay',
    onPage(message, fromStudentId) {
      if (message.type === 'sceneDevice') {
        device = message.canPlay ? 'canPlay' : 'cannotPlay';
        canPlayTakes = message.canPlayTakes ?? message.canPlay;
        canDrawRecipes = message.canDrawRecipes ?? true;
        studentId = fromStudentId;
        const waiting = waitingForDevice;
        waitingForDevice = null;
        if (!message.canPlay) {
          if (opening.kind !== 'over' && !current) giveOpening(null);
          if (current) end(current, 'pageCannotPlay');
          return settlePictureWaits(false);
        }
        const ready = current?.work.desk.getState();
        if (waiting !== null) start(waiting);
        else if (current && current.page.kind !== 'notAsked') loadInPage(current, current.page.scene);
        else if (current && ready?.kind === 'ready') loadInPage(current, ready.scene);
        bringPictureBack();
        sendPreparedAgain();
        onPageReady?.();
        return;
      }
      if (message.type !== 'sceneLoaded' && onPrepared(message)) return;
      if (message.type === 'scenePrepared') return;
      if (message.type === 'sceneRefused' && message.sceneId === onScreen?.id) settlePictureWaits(false);
      if (message.type === 'sceneLoaded' && message.sceneId === onScreen?.id) settlePictureWaits(true);
      const pending = current;
      if (pending?.page.kind !== 'loading' || pending.page.scene.id !== message.sceneId) return;
      pending.work.notePage?.(message.type === 'sceneLoaded');
      if (message.type === 'sceneRefused') return end(pending, 'refusedByPage');
      clearTimeout(pending.page.limit);
      pending.page = { kind: 'loaded', scene: pending.page.scene };
      trace('scenePageHas', { afterMs: Math.round(getNowMs() - pending.askedAtMs) });
      land(pending);
    },
    notePause() {
      const pending = current;
      if (!pending) return sayWordsLeft();
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
    noteEarlyQuestion(question, forStudentId) {
      if (!fast || isStopped) return;
      studentId = forStudentId;
      if (!ask(question, true) || !current) return;
      current.isEarly = true;
      trace('sceneAskedEarly', { text: question });
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
        if (current) {
          current.heldForWordsSinceMs ??= getNowMs();
          land(current);
        }
      });
    },
    noteStudentTurn() {
      const isFirstTurn = !hasHadStudentTurn;
      hasHadStudentTurn = true;
      isAfterSafetyReply = false;
      isTitleUnheard = false;
      // A card's title reaches the tutor as the first turn, and that turn is what asked.
      if (isFirstTurn && (current?.isOpening || current?.isEarly || opening.kind !== 'over')) return;
      if (waitingForDevice !== null) askedTopics.delete(waitingForDevice.trim().toLowerCase());
      waitingForDevice = null;
      if (fast) {
        if (current) current.canLandOnSentence = false;
        screen = noteStudentTurnAway(screen);
        return;
      }
      if (current && !current.isKit) end(current, 'studentTurn');
    },
    noteSafetyReply() {
      isAfterSafetyReply = true;
      waitingForDevice = null;
      liveWords?.noteSafetyReply();
      screen = dropAllWordsLeft(screen);
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
      if (fast) onNewLessonTitle(title);
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
      isStopped = true;
      waitingForDevice = null;
      if (current) end(current, 'studentLeft');
      giveOpening(null);
      settlePictureWaits(false);
      for (const work of works.splice(0)) work.leave();
      prepared.clear();
    },
    noteSentenceBreak() {
      if (current) land(current, 'sentence');
    },
    noteWordsSettled(sceneId) {
      if (current?.heldForWordsSinceMs != null && getSceneWaiting(current)?.id === sceneId) land(current);
    },
    noteReactionOver() {
      if (current?.isEarly) land(current);
    },
    holdFirstWord() {
      if (!current?.isEarly || hasHeldFirstWord) return Promise.resolve();
      hasHeldFirstWord = true;
      return new Promise((resolve) => {
        const limit = setTimeout(resolve, EARLY_PICTURE_HOLD_MS);
        endEarlyHold = () => {
          clearTimeout(limit);
          resolve();
        };
      });
    },
    noteSceneCut(heard) {
      screen = noteSceneWordsCut(screen, heard, `r${(wordCuts += 1)}`);
    },
    takeOwedCommands() {
      const taken = takeOwedCommands(screen);
      screen = taken.screen;
      return taken.owed;
    },
  };
}

export const getSpokenCharacters = (beats: readonly Beat[]) => beats.map(getBeatText).join(' ').length;
