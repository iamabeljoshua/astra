import type { JsonReader } from '../../providers/anthropic.ts';
import { MAY_BE_ABOUT_SAFETY } from '../../tutor/safety-words.ts';
import { isAboutBeingUnsafe, isOnlyAskingForHelp } from '../content-check.ts';
import type { StoredScene } from '../scene-types.ts';
import { checkSceneSpeech, type SceneSpeech, type SpeechProblemKind } from './check-speech.ts';
import { type StudentFacts, writeSceneSpeech } from './write-speech.ts';

/** A reply's first words reach the voice about a second after the ask, and the words carry on from them, so the call waits for them this long at most. */
const FIRST_WORDS_WAIT_MS = 1500;
/** Words written this long ago no longer follow what was just said, so a scene asked again gets new ones. */
const WORDS_STAY_FRESH_MS = 30_000;

type SavedWhy = 'safety' | 'studentWords' | 'noRoom' | 'noReply' | 'failedCheck';

type WordsRun =
  | { kind: 'waitingForFirstWords'; startedAtMs: number; scene: StoredScene; limit: ReturnType<typeof setTimeout> }
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
  /** Starts the one call for this scene, and does nothing if one is under way or fresh. */
  begin(scene: StoredScene): void;
  read(sceneId: string): SceneWordsRead;
  noteFirstWords(): void;
  /** A reply about a child's safety. The rest of this room hears only saved words, so no interest of theirs comes near it. */
  noteSafetyReply(): void;
}

const isAboutTheirSafety = (words: string) => MAY_BE_ABOUT_SAFETY.test(words) || isAboutBeingUnsafe(words) || isOnlyAskingForHelp(words);

// Each scene holds its own run, and nothing here touches the scene store, so a student's words live only as long as this room's beats and log.
export function createLiveSceneWords({ reader, getStudent, isReplyStarting, canSpend, onCost, onSettled, getNowMs, trace }: LiveSceneWordsOptions): LiveSceneWords {
  const runs = new Map<string, WordsRun>();
  let isPlainForGood = false;

  const settle = (sceneId: string, startedAtMs: number, outcome: { kind: 'ready'; speech: SceneSpeech } | { kind: 'saved'; why: SavedWhy }, fields: Record<string, unknown> = {}) => {
    if (runs.get(sceneId)?.startedAtMs !== startedAtMs) return;
    runs.set(sceneId, { ...outcome, startedAtMs });
    trace('sceneWordsSettled', { outcome: outcome.kind === 'ready' ? 'live' : outcome.why, afterMs: Math.round(getNowMs() - startedAtMs), ...fields });
    onSettled(sceneId);
  };

  const write = async (scene: StoredScene, startedAtMs: number) => {
    const student = await getStudent();
    if (isPlainForGood || isAboutTheirSafety(student.studentSaid)) return settle(scene.id, startedAtMs, { kind: 'saved', why: isPlainForGood ? 'safety' : 'studentWords' });
    if (!canSpend()) return settle(scene.id, startedAtMs, { kind: 'saved', why: 'noRoom' });
    const calledAtMs = getNowMs();
    const { answer, costUsd } = await writeSceneSpeech(reader, scene, student);
    onCost(costUsd);
    const checked = checkSceneSpeech({ scene, written: answer, interests: student.interests });
    const usage = { costUsd, callMs: Math.round(getNowMs() - calledAtMs) };
    if (checked.isOk) return settle(scene.id, startedAtMs, { kind: 'ready', speech: checked.speech }, { ...usage, text: checked.speech });
    const problems: readonly SpeechProblemKind[] = [...new Set(checked.problems.map(({ kind }) => kind))];
    settle(scene.id, startedAtMs, { kind: 'saved', why: 'failedCheck' }, { ...usage, problems, text: { written: answer, details: checked.problems } });
  };

  const startWriting = (scene: StoredScene, startedAtMs: number) => {
    runs.set(scene.id, { kind: 'writing', startedAtMs });
    write(scene, startedAtMs).catch((error: unknown) => settle(scene.id, startedAtMs, { kind: 'saved', why: 'noReply' }, { problem: error instanceof Error ? error.name : 'unknown' }));
  };

  const isFresh = (run: WordsRun | undefined) => run !== undefined && getNowMs() - run.startedAtMs <= WORDS_STAY_FRESH_MS;

  return {
    begin(scene) {
      if (isFresh(runs.get(scene.id))) return;
      const startedAtMs = getNowMs();
      if (isPlainForGood) {
        runs.set(scene.id, { kind: 'saved', startedAtMs, why: 'safety' });
        return;
      }
      if (!isReplyStarting()) return startWriting(scene, startedAtMs);
      const limit = setTimeout(() => startWriting(scene, startedAtMs), FIRST_WORDS_WAIT_MS);
      runs.set(scene.id, { kind: 'waitingForFirstWords', startedAtMs, scene, limit });
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
        startWriting(run.scene, run.startedAtMs);
      }
    },
    noteSafetyReply() {
      isPlainForGood = true;
      for (const run of runs.values()) if (run.kind === 'waitingForFirstWords') clearTimeout(run.limit);
    },
  };
}
