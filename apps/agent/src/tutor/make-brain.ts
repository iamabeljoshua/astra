import { getBeatText, type InkPoint, type SessionRecap } from '@astra/contracts';
import { readKey } from '../keys.ts';
import { askPlanner } from '../lesson-plan/ask-planner.ts';
import { createLessonPlanner, type LessonPlanner } from '../lesson-plan/lesson-planner.ts';
import { makeAnthropicJsonReader, makeAnthropicPictureReader, makeAnthropicSourceFinder, makeAnthropicTutorModel, TUTOR_MODEL_NAMES, type TutorModelName } from '../providers/anthropic.ts';
import { getMemoryNote } from '../learner-record/memory-note.ts';
import { createSessionDigest } from '../learner-record/session-digest.ts';
import { writeRecordOfRoom } from '../learner-record/write-record.ts';
import { makeRecordedTutorModel } from '../providers/fake-model.ts';
import { createStandInTutor } from '../live/stand-in-tutor.ts';
import { makeAnthropicSafetyCheck } from '../safety/safety-check.ts';
import { createSafetyWatch, type SessionReading } from '../safety/safety-watch.ts';
import type { RecapFacts } from '../recap/recap-facts.ts';
import { getRecapLines } from '../recap/recap-rules.ts';
import { writeLessonRecap } from '../recap/write-recap.ts';
import { type ApiLink, createApiLink } from './api-link.ts';
import { createTutorBrain, type SpendLimit, type TraceNote, type TurnSummary, type TutorBrain } from './brain.ts';
import { PROMPT_VERSIONS, TUTOR_PROMPT, type TutorPrompt, withScenes } from './prompt.ts';
import { createSpendLedger } from './spend-ledger.ts';
import { readInk } from './ink/read-ink.ts';
import { rasterizeInk } from './ink/rasterize-ink.ts';
import { readSpoken, type SpokenReading } from './watcher/read-spoken.ts';
import type { SpokenExpected } from './watcher/spoken-answer.ts';
import { readWords } from './watcher/read-words.ts';
import type { WordMeaning } from './watcher/watch-rule.ts';

const STAND_IN = 'stand-in';
const RECORDED = 'recorded';
const DEFAULT_MODEL: TutorModelName = 'sonnet-5-5';
const WORDS_MODEL: TutorModelName = 'haiku-5-5';
const FIND_SOURCE_ON = 'on';
const DEFAULT_LIMIT_USD = 8;
const DEFAULT_LIMIT_CREDITS = 1500;
const DEFAULT_SESSION_LIMIT_USD = 1;
/** About an hour of speech and about $1.60 at the listed $40 a million characters. */
const DEFAULT_SESSION_VOICE_LIMIT_CHARACTERS = 40_000;
/** The listed Flash price, from `docs/architecture/live-session.md`. */
const VOICE_USD_PER_CHARACTER = 40 / 1_000_000;
/** The API refuses a larger report, and a long outage can leave more than this unsent. */
const MOST_USD_A_REPORT = 10;

/** Off by default, because a search claim can carry a child's details to a web search whose sub-processors Abel has not approved. Abel decides on switching it on. */
const isFindSourceOn = () => process.env.ASTRA_FIND_SOURCE === FIND_SOURCE_ON;

const getLivePrompt = (): TutorPrompt => (isFindSourceOn() ? PROMPT_VERSIONS.v2FindSource : TUTOR_PROMPT);

function makeLedger() {
  const path = process.env.ASTRA_SPEND_FILE;
  if (!path) return null;
  return createSpendLedger(path, { limitUsd: Number(process.env.ASTRA_SPEND_LIMIT_USD ?? DEFAULT_LIMIT_USD), limitCredits: Number(process.env.ASTRA_SPEND_LIMIT_CREDITS ?? DEFAULT_LIMIT_CREDITS) });
}

export function makeApiLink(roomName: string): ApiLink | null {
  const { ASTRA_API_URL: apiUrl, ASTRA_AGENT_KEY: agentKey } = process.env;
  return apiUrl && agentKey ? createApiLink({ apiUrl, agentKey, roomName }) : null;
}

export interface SpendCaps {
  getSpendLimit(): SpendLimit | null;
  addTurn(summary: { usd: number; voiceCharacters: number }): void;
  /** A scene counts toward the student's day and the shared ledger. It stays out of this room's cap, so a picture can never close the tutor. */
  addScene(usd: number): void;
  /** A shared scene's words are not this student's to pay for, so they count only toward the project's ceiling and their count of plays today. */
  addSharedVoice(characters: number, studentId: string): void;
  getSharedPlaysToday(studentId: string): number;
  getSceneUsd(): number;
  getSpentUsd(): number;
  /** Sends what the API has not heard yet, so a room closing does not lose the last turn's charge. */
  flush(): Promise<void>;
}

// Tracks one room's spending against its own caps, the shared ledger, and the student's total for today in the API.
export function createSpendCaps({ link, ledger, trace, sessionLimitUsd, sessionVoiceLimitCharacters }: { link: Pick<ApiLink, 'reportSpend'> | null; ledger: ReturnType<typeof makeLedger>; trace: TraceNote; sessionLimitUsd: number; sessionVoiceLimitCharacters: number }): SpendCaps {
  let sessionUsd = 0;
  let sceneUsd = 0;
  let sessionCharacters = 0;
  let sessionSharedPlays = 0;
  let unreportedUsd = 0;
  let isOverDailyLimit = false;
  let reporting: Promise<void> = Promise.resolve();

  const report = () => {
    if (!link) return;
    reporting = reporting.then(async () => {
      if (unreportedUsd <= 0) return;
      const usd = Math.min(unreportedUsd, MOST_USD_A_REPORT);
      unreportedUsd -= usd;
      try {
        ({ isOverDailyLimit } = await link.reportSpend(usd));
      } catch (error) {
        unreportedUsd += usd;
        trace('spendReportFailed', { problem: String(error) });
      }
    });
  };

  return {
    getSpendLimit() {
      if (isOverDailyLimit) return 'dailyLimit';
      const isOverSession = sessionUsd >= sessionLimitUsd || sessionCharacters >= sessionVoiceLimitCharacters;
      return isOverSession || ledger?.isOverModelLimit() || ledger?.isOverVoiceLimit() ? 'sessionLimit' : null;
    },
    addTurn({ usd, voiceCharacters }) {
      sessionUsd += usd;
      sessionCharacters += voiceCharacters;
      unreportedUsd += usd + voiceCharacters * VOICE_USD_PER_CHARACTER;
      ledger?.charge({ anthropicUsd: usd, voiceCharacters });
      report();
    },
    addScene(usd) {
      sceneUsd += usd;
      unreportedUsd += usd;
      ledger?.charge({ anthropicUsd: usd, voiceCharacters: 0 });
      report();
    },
    addSharedVoice(characters, studentId) {
      sessionSharedPlays += 1;
      ledger?.charge({ anthropicUsd: 0, voiceCharacters: characters, sharedPlayBy: studentId });
    },
    getSharedPlaysToday: (studentId) => Math.max(sessionSharedPlays, ledger?.countSharedPlays(studentId) ?? 0),
    getSceneUsd: () => sceneUsd,
    getSpentUsd: () => sessionUsd + sceneUsd + sessionCharacters * VOICE_USD_PER_CHARACTER,
    async flush() {
      report();
      await reporting;
    },
  };
}

// The API reads the cache only from about 800 ms after warming starts, measured at 0 reads of 10 at 0 to 300 ms and 9 of 10 at 800 ms and up, and waiting for it costs 885 to 1404 ms. So it starts with the job, before anything else, and nothing waits on it.
export function warmTutorModel(): void {
  const name = process.env.ASTRA_TUTOR_MODEL ?? DEFAULT_MODEL;
  if (!TUTOR_MODEL_NAMES.includes(name as TutorModelName)) return;
  void makeAnthropicTutorModel({ name: name as TutorModelName, apiKey: readKey('ANTHROPIC_API_KEY') }).warm((hasTutorScenes() ? withScenes(getLivePrompt()) : getLivePrompt()).system).catch(() => {});
}

export const hasTutorScenes = () => process.env.ASTRA_TUTOR_SCENES === '1';

export interface MadeBrain {
  brain: TutorBrain;
  caps?: SpendCaps;
  cardTitle?(): string | null;
  flushSpend(): Promise<void>;
  readMeaning?(words: string): Promise<WordMeaning | null>;
  readStrokes?(strokes: readonly (readonly InkPoint[])[]): Promise<{ text: string; ink: { tex?: string; isUnsure: boolean } } | null>;
  readSpokenWords?(words: string, expects: SpokenExpected): Promise<SpokenReading>;
  writeRecap?(facts: RecapFacts): Promise<SessionRecap | null>;
  /** Only a real model has a check, so a recorded one reads nothing. */
  readSafety?(): Promise<SessionReading>;
  getSpentUsd?(): number;
  /** Runs the after-session pass as the room closes. It cannot throw. */
  writeRecord?(): Promise<void>;
  /** A gentle ending means no notes from this room, however the ending decided it. */
  noteNeedsAPerson?(): void;
}

// A recorded model has no key and no words worth reading, so only a real one gets a check.
function makeSafetyWatch({ name, link, showHelp, trace, onCost }: { name: string; link: ApiLink | null; showHelp(): void; trace: TraceNote; onCost(usd: number): void }) {
  if (name === RECORDED) return undefined;
  return createSafetyWatch({ check: makeAnthropicSafetyCheck({ apiKey: readKey('ANTHROPIC_API_KEY'), onCost }), addFlag: (flag) => link?.addFlag(flag) ?? Promise.resolve(), showHelp, trace });
}

// A plan changes the session's title only when the student moves to another topic, and a failed save keeps the page's title and the session running.
function makeLessonPlanner({ link, caps, trace, onSessionTitle }: { link: ApiLink | null; caps: SpendCaps; trace: TraceNote; onSessionTitle(title: string): void }): LessonPlanner {
  const reader = makeAnthropicJsonReader({ apiKey: readKey('ANTHROPIC_API_KEY') });
  return createLessonPlanner({
    ask: (request) => askPlanner(reader, request),
    canSpend: () => caps.getSpendLimit() === null,
    charge: (usd) => caps.addTurn({ usd, voiceCharacters: 0 }),
    onTitleChange(title) {
      onSessionTitle(title);
      link?.setTitle(title).catch((error: unknown) => trace('titleNotSaved', { problem: String(error) }));
    },
    trace,
  });
}

export function makeTutorBrain({ roomName, jobId, trace, showSafetyHelp, onSessionTitle = () => {}, onAskScene, onSafetyReply, onCardKnown }: { roomName: string; jobId: string; trace: TraceNote; showSafetyHelp(): void; onSessionTitle?(title: string): void; onAskScene?(topic: string): void; onSafetyReply?(): void; onCardKnown?(title: string | null): void }): MadeBrain {
  const name = process.env.ASTRA_TUTOR_MODEL ?? DEFAULT_MODEL;
  if (name === STAND_IN) return { brain: createStandInTutor(), flushSpend: async () => {} };
  if (name !== RECORDED && !TUTOR_MODEL_NAMES.includes(name as TutorModelName)) throw new Error(`ASTRA_TUTOR_MODEL is ${name}. Choose ${[STAND_IN, RECORDED, ...TUTOR_MODEL_NAMES].join(', ')}`);
  const link = makeApiLink(roomName);
  const caps = createSpendCaps({
    link,
    ledger: makeLedger(),
    trace,
    sessionLimitUsd: Number(process.env.ASTRA_SESSION_LIMIT_USD ?? DEFAULT_SESSION_LIMIT_USD),
    sessionVoiceLimitCharacters: Number(process.env.ASTRA_SESSION_VOICE_LIMIT_CHARACTERS ?? DEFAULT_SESSION_VOICE_LIMIT_CHARACTERS),
  });
  const model = name === RECORDED ? makeRecordedTutorModel() : makeAnthropicTutorModel({ name: name as TutorModelName, apiKey: readKey('ANTHROPIC_API_KEY') });
  let checkUsd = 0;
  const digest = createSessionDigest();
  const onTurnEnd = (summary: TurnSummary) => {
    digest.addTurn(summary);
    reportTurn(summary);
  };
  const reportTurn = ({ firstTextMs, firstBeatMs, attempts, endedAs, costUsd, usage, refused, refusalCategory, isUsageEstimated, beats, spokenText }: TurnSummary) => {
    trace('turnWritten', { firstTextMs, firstBeatMs, attempts, endedAs, costUsd, usage, refused, refusalCategory, isUsageEstimated, words: spokenText.split(/\s+/).length });
    caps.addTurn({ usd: costUsd + checkUsd, voiceCharacters: beats.map(getBeatText).join(' ').length });
    checkUsd = 0;
  };
  const safety = makeSafetyWatch({ name, link, showHelp: showSafetyHelp, trace, onCost: (usd) => (checkUsd += usd) });
  const flushSpend = async () => {
    await Promise.all([caps.flush(), safety?.flush()]);
  };
  let movedTo: string | null = null;
  const lessonPlanner = name === RECORDED ? undefined : makeLessonPlanner({ link, caps, trace, onSessionTitle(title) {
    movedTo = title;
    onSessionTitle(title);
  } });
  const loadMemory = link ? async () => getMemoryNote(await link.fetchRecord(), new Date()) : undefined;
  const findSource = name === RECORDED || !isFindSourceOn() ? undefined : makeAnthropicSourceFinder({ apiKey: readKey('ANTHROPIC_API_KEY'), onFailed: (problem) => trace('sourceFailed', { problem }) });
  let cardTitle: string | null = null;
  const loadProfile = link
    ? async () => {
        const profile = await link.fetchProfile().catch((error: unknown) => {
          onCardKnown?.(null);
          throw error;
        });
        cardTitle = profile?.cardTitle ?? null;
        onCardKnown?.(cardTitle);
        return profile;
      }
    : undefined;
  if (!loadProfile) queueMicrotask(() => onCardKnown?.(null));
  const brain = createTutorBrain({ model, prompt: onAskScene ? withScenes(getLivePrompt()) : getLivePrompt(), ...(findSource ? { findSource } : {}), loadProfile, loadMemory, onWorkNoted: digest.addWork, trace, onTurnEnd, getSpendLimit: caps.getSpendLimit, ...(safety ? { safety } : {}), ...(lessonPlanner ? { lessonPlanner } : {}), ...(onAskScene ? { onAskScene } : {}), ...(onSafetyReply ? { onSafetyReply } : {}) });
  if (name === RECORDED) return { brain, caps, cardTitle: () => cardTitle, flushSpend };
  const wordsModel = makeAnthropicTutorModel({ name: WORDS_MODEL, apiKey: readKey('ANTHROPIC_API_KEY') });
  const readMeaning = async (words: string) => {
    if (caps.getSpendLimit()) return null;
    const { meaning, costUsd } = await readWords(wordsModel, words);
    caps.addTurn({ usd: costUsd, voiceCharacters: 0 });
    if (meaning === 'needsAPerson') digest.noteNeedsAPerson();
    return meaning;
  };
  const pictureReader = makeAnthropicPictureReader({ apiKey: readKey('ANTHROPIC_API_KEY') });
  const readStrokes = async (strokes: readonly (readonly InkPoint[])[]) => {
    const png = rasterizeInk(strokes);
    if (!png || caps.getSpendLimit()) return null;
    const { costUsd, ...read } = await readInk(pictureReader, png);
    caps.addTurn({ usd: costUsd, voiceCharacters: 0 });
    return read;
  };
  const readSpokenWords = async (words: string, expects: SpokenExpected) => {
    if (caps.getSpendLimit()) return { kind: 'talk' as const, costUsd: 0 };
    const reading = await readSpoken(wordsModel, words, expects);
    caps.addTurn({ usd: reading.costUsd, voiceCharacters: 0 });
    return reading;
  };
  const writeRecap = async (facts: RecapFacts) => {
    if (caps.getSpendLimit()) return null;
    const { recap, costUsd } = await writeLessonRecap(wordsModel, { ...facts, movedTo });
    caps.addTurn({ usd: costUsd, voiceCharacters: recap ? getRecapLines(recap).join(' ').length : 0 });
    return recap;
  };
  // A student who closes the tab gets no recap to carry this, and a read of danger still means no notes from this room.
  const writeRecord = link
    ? async () => {
        if ((await safety?.readSession()) === 'danger') digest.noteNeedsAPerson();
        await writeRecordOfRoom({
          digest,
          model: wordsModel,
          writeNotes: link.writeNotes,
          updateKey: jobId,
          isOverDailyLimit: () => caps.getSpendLimit() === 'dailyLimit',
          addCost: (usd) => caps.addTurn({ usd, voiceCharacters: 0 }),
          trace,
        });
      }
    : undefined;
  return { brain, caps, cardTitle: () => cardTitle, flushSpend, getSpentUsd: caps.getSpentUsd, readMeaning, readStrokes, readSpokenWords, writeRecap, noteNeedsAPerson: digest.noteNeedsAPerson, ...(safety ? { readSafety: safety.readSession } : {}), ...(writeRecord ? { writeRecord } : {}) };
}
