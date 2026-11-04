import type { BoardState } from '@astra/board';
import { parseSceneAgentMessage } from '@astra/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/apiError';
import { api } from '../api/client';
import { type LabSession, type LessonClosed, startLabSession } from '../lab/labSession';
import { getCanPlayScenes } from '../scenes/sceneEngine';
import { createSceneStage, type SceneStage } from '../scenes/sceneStage';
import type { Session } from './sessionQueries';

const RESUME_AFTER_MS = 2500;
const RECORD_KEY = 'astra.lesson.record';
const WORDS_LIMIT_MS = 15_000;
const TOO_MANY_LESSONS_STATUS = 429;

const WAITING_REASONS = ['tooManyStarts', 'studentSpent', 'everyoneSpent'] as const;

/** Why a student has no tutor right now. Each one gets its own message, so a session is never blank with a ticking clock, and a wait is stated only when the server gave one. */
export type LessonProblem = { kind: LessonClosed | 'down' | 'tooMany' | 'twoOpen' | 'silent' } | { kind: (typeof WAITING_REASONS)[number]; retryAfterSeconds: number };

export interface LessonFrame {
  board: BoardState;
  atMs: number;
  caption: string;
}

interface HeldFrame {
  atMs: number;
  source: 'live' | 'replay';
}

export interface Lesson {
  frame: LessonFrame | null;
  stage: SceneStage | null;
  onStageContainer(container: HTMLElement | null): void;
  interrupt(): void;
  problem: LessonProblem | null;
  /** This lesson has no words of its own, so the page offers a way back and no reply box. */
  hasNoLesson: boolean;
  isVoiceAtLimit: boolean;
  tryAgain(): void;
}

declare global {
  interface Window {
    sceneLesson?: LabSession;
    sceneStage?: SceneStage | null;
    holdLessonFrame?(held: HeldFrame | null): void;
  }
}

function getOpenProblem(error: unknown): LessonProblem {
  if (!(error instanceof ApiError) || error.status !== TOO_MANY_LESSONS_STATUS) return { kind: 'down' };
  const { refused, retryAfterSeconds } = (error.responseBody ?? {}) as { refused?: unknown; retryAfterSeconds?: unknown };
  if (refused === 'twoOpen') return { kind: 'twoOpen' };
  const reason = WAITING_REASONS.find((known) => known === refused);
  return reason && typeof retryAfterSeconds === 'number' ? { kind: reason, retryAfterSeconds } : { kind: 'tooMany' };
}

function getShouldRecord(): boolean {
  try {
    return localStorage.getItem(RECORD_KEY) === '1';
  } catch {
    return false;
  }
}

// Stands in for the live room until M3.6 and M3.7 land.
export function useLesson(session: Session): Lesson {
  const [frame, setFrame] = useState<LessonFrame | null>(null);
  const [stage, setStage] = useState<SceneStage | null>(null);
  const sessionRef = useRef<LabSession | null>(null);
  const stageRef = useRef<SceneStage | null>(null);
  const heldRef = useRef<HeldFrame | null>(null);
  const [problem, setProblem] = useState<LessonProblem | null>(null);
  const [hasNoLesson, setHasNoLesson] = useState(false);
  const [isVoiceAtLimit, setIsVoiceAtLimit] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const onStageContainer = useCallback((container: HTMLElement | null) => {
    stageRef.current?.free();
    stageRef.current = container ? createSceneStage(container) : null;
    setStage(stageRef.current);
    if (import.meta.env.DEV) window.sceneStage = stageRef.current;
  }, []);

  const loadScene = useCallback(async (value: unknown) => {
    const parsed = parseSceneAgentMessage(value);
    const current = sessionRef.current;
    if (!parsed.ok || !current) return;
    if (parsed.value.type === 'noLesson') setHasNoLesson(true);
    if (parsed.value.type === 'voiceAtLimit') setIsVoiceAtLimit(true);
    if (parsed.value.type !== 'loadScene') return;
    const { sceneId, durationSeconds } = parsed.value;
    const startedAtMs = performance.now();
    const isLoaded = (await stageRef.current?.load(sceneId, durationSeconds)) ?? false;
    performance.measure('scene-load', { start: startedAtMs });
    current.sendScene({ type: isLoaded ? 'sceneLoaded' : 'sceneRefused', sceneId });
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) {
      window.holdLessonFrame = (held) => {
        heldRef.current = held;
      };
    }
    let isLeaving = false;
    let animationFrame = 0;
    let wordsLimit: ReturnType<typeof setTimeout> | undefined;
    const showProblem = (next: LessonProblem) => {
      if (!isLeaving) setProblem(next);
    };
    const draw = () => {
      animationFrame = requestAnimationFrame(draw);
      const current = sessionRef.current;
      if (!current) return;
      const held = heldRef.current;
      if (held) {
        setFrame({ board: held.source === 'replay' ? current.getReplayBoard(held.atMs) : current.player.getBoard(held.atMs), atMs: held.atMs, caption: '' });
        return;
      }
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
          shouldRecordPcm: import.meta.env.DEV && getShouldRecord(),
          onAgentReady: () => void getCanPlayScenes().then((canPlay) => sessionRef.current?.sendScene({ type: 'sceneDevice', canPlay })),
          onLogChange: () => {},
          onSceneMessage: (value) => void loadScene(value),
          onClosed: (closed) => showProblem({ kind: closed }),
        });
        if (isLeaving) {
          void started.close();
          return;
        }
        sessionRef.current = started;
        if (import.meta.env.DEV) window.sceneLesson = started;
        wordsLimit = setTimeout(() => {
          if (started.records.agentMessages.length === 0) showProblem({ kind: 'silent' });
        }, WORDS_LIMIT_MS);
        animationFrame = requestAnimationFrame(draw);
      }).catch((error: unknown) => showProblem(getOpenProblem(error)));
    });
    return () => {
      isLeaving = true;
      clearTimeout(start);
      clearTimeout(wordsLimit);
      cancelAnimationFrame(animationFrame);
      void sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, [attempt, loadScene, session.id]);

  const interrupt = useCallback(() => {
    sessionRef.current?.command({ type: 'interrupt' });
    setTimeout(() => sessionRef.current?.command({ type: 'resume' }), RESUME_AFTER_MS);
  }, []);

  const tryAgain = useCallback(() => {
    setProblem(null);
    setAttempt((count) => count + 1);
  }, []);

  return { frame, stage, onStageContainer, interrupt, problem, hasNoLesson, isVoiceAtLimit, tryAgain };
}
