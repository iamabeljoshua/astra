import { type Beat, getBeatText, type ElementId, type SceneAgentMessage, type SceneBrowserMessage } from '@astra/contracts';
import { getSceneBeats } from '../scenes/lesson/lesson-beats.ts';
import { createLessonWork, type LessonWork } from '../scenes/lesson/lesson-work.ts';
import type { TopicRuns } from '../scenes/lesson/topic-runs.ts';
import { getSceneCommand, SHOW_WINDOW_MS, type SceneState } from '../scenes/scene-desk.ts';
import type { SceneStore } from '../scenes/scene-store.ts';
import type { LessonPlan, SceneRouter, StoredScene } from '../scenes/scene-types.ts';
import type { AheadNews } from '../scene-queue/scene-queue.ts';
import type { TutorBeat } from './brain.ts';

/** A take in the browser took 96 ms with the engine fetched, so this only covers a slow line. */
const PAGE_LOAD_LIMIT_MS = 6000;
const MOST_ASKS_IN_A_SESSION = 6;
const MOST_TOPIC_CHARACTERS = 80;
const BREATH_MS = 300;
const RECHECK_PAUSE_MS = 500;

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
  onShown(shown: { topic: string; beats: readonly Beat[]; isShared: boolean }): void;
  /** A scene started ahead of its moment is in the page, or will never be. */
  onAhead?(request: string, news: AheadNews): void;
  onPageReady?(): void;
  trace(name: string, fields?: Record<string, unknown>): void;
}

export interface TutorScenes {
  /** Never waits, and nothing a student could hear comes from it unless a scene lands. */
  ask(topic: string): void;
  /** Starts a scene before its moment. It lands only if it is asked for later. */
  prepare(request: string): boolean;
  /** Nobody will ask for this now, so a write still running stops. */
  dropPrepared(request: string): void;
  /** Its moment has passed, so whatever is waiting to land goes silently. */
  dropWaiting(how: 'movedOn' | 'switched'): void;
  /** Nothing more is prepared or lands in this session. */
  stop(): void;
  canPlay(): boolean;
  onPage(message: SceneBrowserMessage, studentId: string): void;
  /** The tutor has stopped talking, so the window opens, and a scene already loaded can land. */
  notePause(): void;
  close(): void;
}

type PageState = { kind: 'notAsked' } | { kind: 'loading'; scene: StoredScene; limit: ReturnType<typeof setTimeout> } | { kind: 'loaded'; scene: StoredScene };

interface SceneAsk {
  topic: string;
  work: LessonWork;
  askedAtMs: number;
  windowLimit: ReturnType<typeof setTimeout> | null;
  recheck: ReturnType<typeof setTimeout> | null;
  page: PageState;
  /** Started ahead of its moment, so its bytes are in the page and only its first frame is left to do. */
  isAhead: boolean;
}

type Device = 'unknown' | 'canPlay' | 'cannotPlay';

const sameWords = (first: string, second: string) => first.trim().toLowerCase() === second.trim().toLowerCase();

// The setup points at the picture, so the picture is on screen before its first word, and a student never hears about something they cannot see.
export function getTutorSceneBeats({ plan, scene, number }: { plan: LessonPlan; scene: StoredScene; number: number }): TutorBeat[] {
  const sceneCommand = getSceneCommand(scene, `scene-${number}` as ElementId);
  const beats = getSceneBeats({ setup: plan.setup, narration: plan.narration, scene: sceneCommand }).map((beat) => ({ ...beat, id: `n${number}-${beat.id}` as Beat['id'] }));
  const [first, ...rest] = beats.map((beat) => ({ ...beat, script: beat.script.filter((part) => typeof part === 'string' || part.kind !== 'richScene') }));
  if (!first) return [];
  const opening: TutorBeat = { ...first, script: [sceneCommand, { kind: 'boardMode', mode: 'teach' }, ...first.script] };
  const close: TutorBeat = { id: `n${number}-close` as Beat['id'], script: [plan.close], expectsReply: true };
  return [opening, ...[...rest, close].map((beat) => ({ ...beat, pauseBeforeMs: BREATH_MS }))];
}

export function createTutorScenes({ router, runs, store, getCardTitle, getNowMs, send, speak, canSpeak, onShown, onAhead, onPageReady, trace }: TutorScenesOptions): TutorScenes {
  let device: Device = 'unknown';
  let studentId = '';
  let current: SceneAsk | null = null;
  let waitingForDevice: string | null = null;
  let scenesShown = 0;
  let isStopped = false;
  let lastShown: StoredScene | null = null;
  const askedTopics = new Set<string>();
  const prepared = new Map<string, SceneAsk>();
  const works: LessonWork[] = [];

  const toKey = (topic: string) => topic.trim().toLowerCase();

  const end = (ask: SceneAsk, how: string) => {
    if (ask !== current) return;
    if (ask.windowLimit) clearTimeout(ask.windowLimit);
    if (ask.recheck) clearTimeout(ask.recheck);
    if (ask.page.kind === 'loading') clearTimeout(ask.page.limit);
    current = null;
    // What missed its moment is saved, so asking again is free.
    if (how === 'tooLate' || how === 'movedOn' || how === 'switched') askedTopics.delete(toKey(ask.topic));
    if (ask.isAhead && how !== 'landed') onAhead?.(ask.topic, how === 'declined' || how === 'failed' ? how : 'missed');
    trace('sceneEnded', { how, afterMs: Math.round(getNowMs() - ask.askedAtMs) });
  };

  // A scene started ahead takes its first frame only at the pause, because the page holds one player and the last scene may still be on screen.
  const isAheadAndNotLoaded = (ask: SceneAsk) => ask.isAhead && ask.page.kind === 'notAsked' && ask.work.desk.getState().kind === 'ready';

  const land = (ask: SceneAsk) => {
    if (ask !== current || (ask.page.kind !== 'loaded' && !isAheadAndNotLoaded(ask))) return;
    if (ask.recheck) clearTimeout(ask.recheck);
    if (!canSpeak()) {
      ask.recheck = setTimeout(() => land(ask), RECHECK_PAUSE_MS);
      return;
    }
    if (ask.page.kind === 'notAsked') {
      const state = ask.work.desk.getState();
      if (state.kind === 'ready') loadInPage(ask, state.scene);
      return;
    }
    const scene = ask.work.desk.takeReady();
    if (!scene) return end(ask, 'tooLate');
    const number = (scenesShown += 1);
    const beats = getTutorSceneBeats({ plan: scene.plan, scene, number });
    if (!speak(beats)) return end(ask, 'lostThePause');
    lastShown = scene;
    onShown({ topic: ask.topic, beats, isShared: scene.ownerId === null });
    end(ask, 'landed');
  };

  const loadInPage = (ask: SceneAsk, scene: StoredScene) => {
    const limit = setTimeout(() => end(ask, 'pageTooSlow'), PAGE_LOAD_LIMIT_MS);
    ask.page = { kind: 'loading', scene, limit };
    send({ type: 'loadScene', sceneId: scene.id, durationSeconds: scene.durationSeconds });
  };

  const forgetPrepared = (ask: SceneAsk, news: AheadNews) => {
    prepared.delete(toKey(ask.topic));
    onAhead?.(ask.topic, news);
  };

  const onDeskChange = (ask: SceneAsk, state: SceneState) => {
    trace('sceneState', { state: state.kind, afterMs: Math.round(getNowMs() - ask.askedAtMs) });
    if (prepared.get(toKey(ask.topic)) === ask) {
      if (state.kind === 'ready') send({ type: 'prepareScene', sceneId: state.scene.id });
      if (state.kind === 'declined' || state.kind === 'failed') forgetPrepared(ask, state.kind);
      return;
    }
    // A scene that comes after its window stays saved for the next ask, and this session has moved on.
    if (ask !== current) return;
    if (state.kind === 'ready') loadInPage(ask, state.scene);
    if (state.kind === 'declined' || state.kind === 'failed') end(ask, state.kind);
  };

  const makeAsk = (topic: string, isAhead: boolean): SceneAsk => {
    const cardTitle = getCardTitle();
    const isCard = cardTitle !== null && sameWords(cardTitle, topic);
    const ask: SceneAsk = { topic, askedAtMs: getNowMs(), windowLimit: null, recheck: null, page: { kind: 'notAsked' }, isAhead, work: undefined as unknown as LessonWork };
    ask.work = createLessonWork({ router, runs, store, request: isCard ? cardTitle : topic, isCard, studentId, getNowMs, isOnlyForScene: true, onChange: (state) => onDeskChange(ask, state) });
    works.push(ask.work);
    trace('sceneAsked', { text: topic, isCard, isAhead });
    return ask;
  };

  const start = (topic: string) => {
    const ask = makeAsk(topic, false);
    current = ask;
    ask.work.desk.ask(ask.work.request);
  };

  // A scene still being written goes on as any ask would, and one that is ready waits only for the pause.
  const startPrepared = (ask: SceneAsk) => {
    prepared.delete(toKey(ask.topic));
    current = ask;
    ask.askedAtMs = getNowMs();
    const { kind } = ask.work.desk.getState();
    if (kind === 'ready') land(ask);
    else if (kind === 'declined' || kind === 'failed') end(ask, kind);
  };

  const resendToPage = () => {
    for (const ask of prepared.values()) {
      const state = ask.work.desk.getState();
      if (state.kind === 'ready') send({ type: 'prepareScene', sceneId: state.scene.id });
    }
    const page = current?.page;
    if (current && (page?.kind === 'loading' || page?.kind === 'loaded')) {
      if (page.kind === 'loading') clearTimeout(page.limit);
      loadInPage(current, page.scene);
    } else if (lastShown) {
      send({ type: 'loadScene', sceneId: lastShown.id, durationSeconds: lastShown.durationSeconds });
    }
  };

  const onPrepared = (message: Extract<SceneBrowserMessage, { type: 'scenePrepared' | 'sceneRefused' }>) => {
    for (const ask of prepared.values()) {
      const state = ask.work.desk.getState();
      if (state.kind !== 'ready' || state.scene.id !== message.sceneId) continue;
      if (message.type === 'sceneRefused') forgetPrepared(ask, 'failed');
      else onAhead?.(ask.topic, 'ready');
      return true;
    }
    return false;
  };

  return {
    ask(topic) {
      const key = toKey(topic);
      if (isStopped || device === 'cannotPlay' || current || waitingForDevice !== null || key === '' || topic.length > MOST_TOPIC_CHARACTERS || askedTopics.has(key) || askedTopics.size >= MOST_ASKS_IN_A_SESSION) return;
      askedTopics.add(key);
      const ahead = prepared.get(key);
      if (ahead) startPrepared(ahead);
      else if (device === 'unknown') waitingForDevice = topic;
      else start(topic);
    },
    prepare(request) {
      const key = toKey(request);
      if (isStopped || device !== 'canPlay' || prepared.has(key) || askedTopics.has(key) || request.length > MOST_TOPIC_CHARACTERS) return false;
      const ask = makeAsk(request, true);
      prepared.set(key, ask);
      ask.work.desk.ask(ask.work.request);
      return true;
    },
    dropPrepared(request) {
      const ask = prepared.get(toKey(request));
      if (!ask) return;
      prepared.delete(toKey(request));
      ask.work.leave();
    },
    dropWaiting(how) {
      const ask = current;
      if (!ask) return;
      end(ask, how);
      if (how === 'switched') ask.work.leave();
    },
    stop() {
      isStopped = true;
      if (current) end(current, 'safety');
      for (const ask of prepared.values()) ask.work.leave();
      prepared.clear();
    },
    canPlay: () => device === 'canPlay',
    onPage(message, fromStudentId) {
      if (message.type === 'sceneDevice') {
        const isReload = device !== 'unknown';
        device = message.canPlay ? 'canPlay' : 'cannotPlay';
        studentId = fromStudentId;
        const waiting = waitingForDevice;
        waitingForDevice = null;
        if (waiting !== null && message.canPlay) start(waiting);
        if (isReload && message.canPlay) resendToPage();
        onPageReady?.();
        return;
      }
      if (message.type !== 'sceneLoaded' && onPrepared(message)) return;
      if (message.type === 'scenePrepared') return;
      const ask = current;
      if (ask?.page.kind !== 'loading' || ask.page.scene.id !== message.sceneId) return;
      if (message.type === 'sceneRefused') return end(ask, 'refusedByPage');
      clearTimeout(ask.page.limit);
      ask.page = { kind: 'loaded', scene: ask.page.scene };
      land(ask);
    },
    notePause() {
      const ask = current;
      if (!ask) return;
      if (!ask.windowLimit) {
        // Starts the desk's own clock without taking the scene.
        void ask.work.desk.untilLastChance();
        ask.windowLimit = setTimeout(() => end(ask, 'tooLate'), SHOW_WINDOW_MS);
      }
      land(ask);
    },
    close() {
      if (current) end(current, 'studentLeft');
      for (const work of works) work.leave();
    },
  };
}

export const getSpokenCharacters = (beats: readonly Beat[]) => beats.map(getBeatText).join(' ').length;
