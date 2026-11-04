import type { BoardState } from '@astra/board';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveVoice } from '../voice/liveVoice';
import { getCanPlayScenes } from './sceneEngine';
import { createSceneStage, type SceneStage } from './sceneStage';

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

export interface TutorScene {
  stage: SceneStage | null;
  /** A take loads before it shows, so its canvas waits off screen and moves in when the scene lands. */
  onContainer(container: HTMLElement | null): void;
}

export function useTutorScene(voice: LiveVoice | null, isEnabled: boolean): TutorScene {
  const [stage, setStage] = useState<SceneStage | null>(null);
  const parts = useRef<{ parking: HTMLElement; host: HTMLElement } | null>(null);

  useEffect(() => {
    if (!voice || !isEnabled) return undefined;
    let isGone = false;
    let stopListening = () => {};
    let freeStage = () => {};

    const openStage = () => {
      const parking = createParking();
      const host = createHost();
      parking.append(host);
      document.body.append(parking);
      parts.current = { parking, host };
      const made = createSceneStage(host);
      setStage(made);
      stopListening = voice.onSceneMessage((message) => {
        if (message.type !== 'loadScene') return;
        const { sceneId, durationSeconds } = message;
        void made.load(sceneId, durationSeconds).then((isLoaded) => {
          if (!isGone) voice.sendScene({ type: isLoaded ? 'sceneLoaded' : 'sceneRefused', sceneId });
        });
      });
      freeStage = () => {
        made.free();
        parking.remove();
        parts.current = null;
        setStage(null);
      };
    };

    void getCanPlayScenes().then((canPlay) => {
      if (isGone) return;
      if (canPlay) openStage();
      voice.sendScene({ type: 'sceneDevice', canPlay });
    });
    return () => {
      isGone = true;
      stopListening();
      freeStage();
    };
  }, [voice, isEnabled]);

  const onContainer = useCallback((container: HTMLElement | null) => {
    if (!parts.current) return;
    (container ?? parts.current.parking).append(parts.current.host);
  }, []);

  return { stage, onContainer };
}

export function hasDrawableScene(board: BoardState, stage: SceneStage | null): boolean {
  const scene = [...board.elements.values()].filter((element) => element.content.kind === 'richScene').at(-1)?.content;
  return Boolean(stage && scene?.kind === 'richScene' && stage.canDraw(scene.sceneId));
}
