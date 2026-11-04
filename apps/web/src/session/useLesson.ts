import type { BoardState } from '@astra/board';
import { parseSceneAgentMessage } from '@astra/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { type LabSession, startLabSession } from '../lab/labSession';
import { getCanPlayScenes } from '../scenes/sceneEngine';
import { createSceneStage, type SceneStage } from '../scenes/sceneStage';
import type { Session } from './sessionQueries';

const RESUME_AFTER_MS = 2500;

export interface LessonFrame {
  board: BoardState;
  atMs: number;
  caption: string;
}

export interface Lesson {
  frame: LessonFrame | null;
  stage: SceneStage | null;
  onStageContainer(container: HTMLElement | null): void;
  /** The student spoke over the tutor. The board freezes, and the stand-in carries on from the word it was cut on. */
  interrupt(): void;
}

declare global {
  interface Window {
    sceneLesson?: LabSession;
  }
}

// Stands in for the live room until M3.6 and M3.7 land. It joins, plays what the agent sends on the real clock, and answers when asked to load a scene.
export function useLesson(session: Session): Lesson {
  const [frame, setFrame] = useState<LessonFrame | null>(null);
  const [stage, setStage] = useState<SceneStage | null>(null);
  const sessionRef = useRef<LabSession | null>(null);
  const stageRef = useRef<SceneStage | null>(null);

  const onStageContainer = useCallback((container: HTMLElement | null) => {
    stageRef.current?.free();
    stageRef.current = container ? createSceneStage(container) : null;
    setStage(stageRef.current);
  }, []);

  const loadScene = useCallback(async (value: unknown) => {
    const parsed = parseSceneAgentMessage(value);
    const current = sessionRef.current;
    if (!parsed.ok || !current) return;
    const { sceneId, durationSeconds } = parsed.value;
    const isLoaded = (await stageRef.current?.load(sceneId, durationSeconds)) ?? false;
    current.sendScene({ type: isLoaded ? 'sceneLoaded' : 'sceneRefused', sceneId });
  }, []);

  useEffect(() => {
    let isLeaving = false;
    let animationFrame = 0;
    const draw = () => {
      animationFrame = requestAnimationFrame(draw);
      const current = sessionRef.current;
      if (!current) return;
      const { board, atMs } = current.getBoardNow();
      current.records.frames.push({ atMs, ms: performance.now() });
      setFrame({ board, atMs, caption: current.player.getCaption() });
    };
    // Strict mode mounts twice in development, and this waits out the first mount so one lesson starts.
    const start = setTimeout(() => {
      void api.post('/sessions/{id}/scene-lesson', { params: { path: { id: session.id } } }).then(async ({ url, token }) => {
        if (isLeaving) return;
        const started = await startLabSession({
          url,
          token,
          shouldRecordPcm: new URLSearchParams(window.location.search).get('record') === '1',
          onAgentReady: () => void getCanPlayScenes().then((canPlay) => sessionRef.current?.sendScene({ type: 'sceneDevice', canPlay })),
          onLogChange: () => {},
          onSceneMessage: (value) => void loadScene(value),
        });
        if (isLeaving) {
          void started.close();
          return;
        }
        sessionRef.current = started;
        window.sceneLesson = started;
        animationFrame = requestAnimationFrame(draw);
      }).catch(() => {});
    });
    return () => {
      isLeaving = true;
      clearTimeout(start);
      cancelAnimationFrame(animationFrame);
      void sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, [loadScene, session.id]);

  const interrupt = useCallback(() => {
    sessionRef.current?.command({ type: 'interrupt' });
    setTimeout(() => sessionRef.current?.command({ type: 'resume' }), RESUME_AFTER_MS);
  }, []);

  return { frame, stage, onStageContainer, interrupt };
}
