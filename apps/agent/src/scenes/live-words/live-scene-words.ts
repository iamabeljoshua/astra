import type { JsonReader } from '../../providers/anthropic.ts';
import { MAY_BE_ABOUT_SAFETY } from '../../tutor/safety-words.ts';
import { isAboutBeingUnsafe, isOnlyAskingForHelp } from '../content-check.ts';
import type { StoredScene } from '../scene-types.ts';
import { checkSceneSpeech, type SceneSpeech, type SpeechProblemKind } from './check-speech.ts';
import { type StudentFacts, writeSceneSpeech } from './write-speech.ts';

const FIRST_WORDS_WAIT_MS = 1500;
const WORDS_STAY_FRESH_MS = 30_000;

type SavedWhy = 'safety' | 'studentWords' | 'noRoom' | 'noReply' | 'failedCheck';

type WordsRun =
  | { kind: 'waitingForFirstWords'; startedAtMs: number; scene: StoredScene; askedAbout: string; limit: ReturnType<typeof setTimeout> }
  | { kind: 'writing'; startedAtMs: number }
  | { kind: 'ready'; startedAtMs: number; speech: SceneSpeech }
  | { kind: 'saved'; startedAtMs: number; why: SavedWhy };

export type SceneWordsRead = { kind: 'writing' } | { kind: 'live'; speech: SceneSpeech } | { kind: 'saved' };

export interface LiveSceneWordsOptions {
  reader: JsonReader;
  getStudent(): Promise<StudentFacts>;
  isReplyStarting(): boolean;
  canSpend(): boolean;
  onCost(usd: number): void;
  onSettled(sceneId: string): void;
  getNowMs(): number;
  trace(name: string, fields?: Record<string, unknown>): void;
}

export interface LiveSceneWords {
  startOnce(scene: StoredScene, askedAbout: string): void;
  read(sceneId: string): SceneWordsRead;
  noteFirstWords(): void;
  noteSafetyReply(): void;
}

const isAboutTheirSafety = (words: string) => MAY_BE_ABOUT_SAFETY.test(words) || isAboutBeingUnsafe(words) || isOnlyAskingForHelp(words);

// Each scene holds its own run, and nothing here touches the scene store.
export function createLiveSceneWords({ reader, getStudent, isReplyStarting, canSpend, onCost, onSettled, getNowMs, trace }: LiveSceneWordsOptions): LiveSceneWords {
  const runs = new Map<string, WordsRun>();
  let isPlainForGood = false;

  const settle = (sceneId: string, startedAtMs: number, outcome: { kind: 'ready'; speech: SceneSpeech } | { kind: 'saved'; why: SavedWhy }, fields: Record<string, unknown> = {}) => {
    if (runs.get(sceneId)?.startedAtMs !== startedAtMs) return;
    runs.set(sceneId, { ...outcome, startedAtMs });
    trace('sceneWordsSettled', { outcome: outcome.kind === 'ready' ? 'live' : outcome.why, afterMs: Math.round(getNowMs() - startedAtMs), ...fields });
    onSettled(sceneId);
  };

  const write = async (scene: StoredScene, askedAbout: string, startedAtMs: number) => {
    const student = await getStudent();
    if (isPlainForGood || isAboutTheirSafety(student.studentSaid) || isAboutTheirSafety(askedAbout)) return settle(scene.id, startedAtMs, { kind: 'saved', why: isPlainForGood ? 'safety' : 'studentWords' });
    if (!canSpend()) return settle(scene.id, startedAtMs, { kind: 'saved', why: 'noRoom' });
    const calledAtMs = getNowMs();
    const { answer, costUsd } = await writeSceneSpeech(reader, { scene, student, askedAbout });
    onCost(costUsd);
    const checked = checkSceneSpeech({ scene, written: answer, interests: student.interests });
    const usage = { costUsd, callMs: Math.round(getNowMs() - calledAtMs) };
    if (checked.isOk) return settle(scene.id, startedAtMs, { kind: 'ready', speech: checked.speech }, { ...usage, text: checked.speech });
    const problems: readonly SpeechProblemKind[] = [...new Set(checked.problems.map(({ kind }) => kind))];
    settle(scene.id, startedAtMs, { kind: 'saved', why: 'failedCheck' }, { ...usage, problems, text: { written: answer, details: checked.problems } });
  };

  const startWriting = (scene: StoredScene, askedAbout: string, startedAtMs: number) => {
    runs.set(scene.id, { kind: 'writing', startedAtMs });
    write(scene, askedAbout, startedAtMs).catch((error: unknown) => settle(scene.id, startedAtMs, { kind: 'saved', why: 'noReply' }, { problem: error instanceof Error ? error.name : 'unknown' }));
  };

  const isFresh = (run: WordsRun | undefined) => run !== undefined && getNowMs() - run.startedAtMs <= WORDS_STAY_FRESH_MS;

  return {
    startOnce(scene, askedAbout) {
      if (isFresh(runs.get(scene.id))) return;
      const startedAtMs = getNowMs();
      if (isPlainForGood) {
        runs.set(scene.id, { kind: 'saved', startedAtMs, why: 'safety' });
        return;
      }
      if (!isReplyStarting()) return startWriting(scene, askedAbout, startedAtMs);
      const limit = setTimeout(() => startWriting(scene, askedAbout, startedAtMs), FIRST_WORDS_WAIT_MS);
      runs.set(scene.id, { kind: 'waitingForFirstWords', startedAtMs, scene, askedAbout, limit });
    },
    read(sceneId) {
      if (isPlainForGood) return { kind: 'saved' };
      const run = runs.get(sceneId);
      if (run?.kind === 'ready') return { kind: 'live', speech: run.speech };
      return run?.kind === 'writing' || run?.kind === 'waitingForFirstWords' ? { kind: 'writing' } : { kind: 'saved' };
    },
    noteFirstWords() {
      for (const run of runs.values()) {
        if (run.kind !== 'waitingForFirstWords') continue;
        clearTimeout(run.limit);
        startWriting(run.scene, run.askedAbout, run.startedAtMs);
      }
    },
    noteSafetyReply() {
      isPlainForGood = true;
      for (const run of runs.values()) if (run.kind === 'waitingForFirstWords') clearTimeout(run.limit);
    },
  };
}
