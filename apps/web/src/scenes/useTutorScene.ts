import type { BoardState } from '@astra/board';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveVoice } from '../voice/liveVoice';
import { getCanPlayScenes } from './sceneEngine';
import { createKitSceneStage } from './kitSceneStage';
import type { SceneStage } from './sceneStage';

const PARKED_WIDTH = 960;
const PARKED_HEIGHT = 540;

function createParking(): HTMLElement {
  const parking = document.createElement('div');
  parking.setAttribute('aria-hidden', 'true');
  Object.assign(parking.style, { position: 'fixed', left: '-200vw', top: '0', width: `${PARKED_WIDTH}px`, height: `${PARKED_HEIGHT}px`, pointerEvents: 'none' });
  return parking;
}

function createHost(): HTMLElement {
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'absolute', inset: '0', overflow: 'hidden' });
  return host;
}

/** Moving an iframe the plain way reloads it, so a frame prepared off screen keeps its scene only through an atomic move. */
function moveInto(parent: HTMLElement, child: HTMLElement): void {
  if (!('moveBefore' in parent)) return parent.append(child);
  try {
    (parent as HTMLElement & { moveBefore(node: Node, before: Node | null): void }).moveBefore(child, null);
  } catch {
    parent.append(child);
  }
}

export interface TutorScene {
  stage: SceneStage | null;
  /** A take loads before it shows, so its canvas waits off screen and moves in when the scene lands. */
  onContainer(container: HTMLElement | null): void;
}

function getLatestScene(board: BoardState) {
  const content = [...board.elements.values()].filter((element) => element.content.kind === 'richScene').at(-1)?.content;
  return content?.kind === 'richScene' ? content : null;
}

/** A stage with its parking place, for as long as the screen is open. */
function useSceneHost(isEnabled: boolean): TutorScene {
  const [stage, setStage] = useState<SceneStage | null>(null);
  const parts = useRef<{ parking: HTMLElement; host: HTMLElement } | null>(null);
  const [, noteStageChange] = useState(0);

  useEffect(() => {
    if (!isEnabled) return undefined;
    const parking = createParking();
    const host = createHost();
    parking.append(host);
    document.body.append(parking);
    parts.current = { parking, host };
    const made = createKitSceneStage(host, () => noteStageChange((changes) => changes + 1));
    let isGone = false;
    queueMicrotask(() => {
      if (!isGone) setStage(made);
    });
    return () => {
      isGone = true;
      made.free();
      parking.remove();
      parts.current = null;
      setStage(null);
    };
  }, [isEnabled]);

  const onContainer = useCallback((container: HTMLElement | null) => {
    if (!parts.current) return;
    moveInto(container ?? parts.current.parking, parts.current.host);
  }, []);

  return { stage, onContainer };
}

export function useTutorScene(voice: LiveVoice | null, isEnabled: boolean): TutorScene {
  const [canPlay, setCanPlay] = useState(false);
  const scene = useSceneHost(canPlay && voice !== null && isEnabled);
  const { stage } = scene;

  useEffect(() => {
    if (!voice || !isEnabled) return undefined;
    let isGone = false;
    void getCanPlayScenes().then((isAble) => {
      if (isGone) return;
      setCanPlay(isAble);
      if (!isAble) voice.sendScene({ type: 'sceneDevice', canPlay: false });
    });
    return () => {
      isGone = true;
      setCanPlay(false);
    };
  }, [voice, isEnabled]);

  useEffect(() => {
    if (!voice || !stage) return undefined;
    let isGone = false;
    const stopListening = voice.onSceneMessage((message) => {
      if (message.type === 'prepareScene') {
        const { sceneId, engine } = message;
        void stage.prepare(sceneId, engine).then((isHeld) => {
          if (!isGone) voice.sendScene({ type: isHeld ? 'scenePrepared' : 'sceneRefused', sceneId });
        });
        return;
      }
      if (message.type !== 'loadScene') return;
      const { sceneId, durationSeconds, engine } = message;
      void stage.load(sceneId, durationSeconds, engine).then((isLoaded) => {
        if (!isGone) voice.sendScene({ type: isLoaded ? 'sceneLoaded' : 'sceneRefused', sceneId });
      });
    });
    voice.sendScene({ type: 'sceneDevice', canPlay: true });
    return () => {
      isGone = true;
      stopListening();
    };
  }, [voice, stage]);

  return scene;
}

export function useReplayScene(board: BoardState, isEnabled: boolean): TutorScene {
  const scene = useSceneHost(isEnabled);
  const { stage } = scene;
  const { sceneId, durationSeconds, engine } = getLatestScene(board) ?? { sceneId: null, durationSeconds: 0, engine: undefined };

  useEffect(() => {
    if (stage && sceneId !== null) void stage.load(sceneId, durationSeconds, engine);
  }, [stage, sceneId, durationSeconds, engine]);

  return scene;
}

export function hasDrawableScene(board: BoardState, stage: SceneStage | null): boolean {
  const scene = getLatestScene(board);
  return Boolean(stage && scene && stage.canDraw(scene.sceneId));
}
