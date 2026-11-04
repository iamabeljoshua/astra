import { getBeatText, type InkPoint, type SessionRecap } from '@astra/contracts';
import { readKey } from '../keys.ts';
import { makeAnthropicPictureReader, makeAnthropicTutorModel, TUTOR_MODEL_NAMES, type TutorModelName } from '../providers/anthropic.ts';
import { makeRecordedTutorModel } from '../providers/fake-model.ts';
import { createStandInTutor } from '../live/stand-in-tutor.ts';
import type { RecapFacts } from '../recap/recap-facts.ts';
import { getRecapLines } from '../recap/recap-rules.ts';
import { writeLessonRecap } from '../recap/write-recap.ts';
import { type ApiLink, createApiLink } from './api-link.ts';
import { createTutorBrain, type SpendLimit, type TraceNote, type TurnSummary, type TutorBrain } from './brain.ts';
import { TUTOR_SYSTEM } from './prompt.ts';
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
const DEFAULT_LIMIT_USD = 8;
const DEFAULT_LIMIT_CREDITS = 1500;
const DEFAULT_SESSION_LIMIT_USD = 1;
/** About an hour of speech and about $1.60 at the listed $40 a million characters. */
const DEFAULT_SESSION_VOICE_LIMIT_CHARACTERS = 40_000;
/** The listed Flash price, from `docs/architecture/live-session.md`. */
const VOICE_USD_PER_CHARACTER = 40 / 1_000_000;
/** The API refuses a larger report, and a long outage can leave more than this unsent. */
const MOST_USD_A_REPORT = 10;

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
  getSpentUsd(): number;
  /** Sends what the API has not heard yet, so a room closing does not lose the last turn's charge. */
  flush(): Promise<void>;
}

// Tracks one room's spending against its own caps, the shared ledger, and the student's total for today in the API.
export function createSpendCaps({ link, ledger, trace, sessionLimitUsd, sessionVoiceLimitCharacters }: { link: Pick<ApiLink, 'reportSpend'> | null; ledger: ReturnType<typeof makeLedger>; trace: TraceNote; sessionLimitUsd: number; sessionVoiceLimitCharacters: number }): SpendCaps {
  let sessionUsd = 0;
  let sessionCharacters = 0;
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
    getSpentUsd: () => sessionUsd + sessionCharacters * VOICE_USD_PER_CHARACTER,
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
  void makeAnthropicTutorModel({ name: name as TutorModelName, apiKey: readKey('ANTHROPIC_API_KEY') }).warm(TUTOR_SYSTEM).catch(() => {});
}

export interface MadeBrain {
  brain: TutorBrain;
  flushSpend(): Promise<void>;
  readMeaning?(words: string): Promise<WordMeaning | null>;
  readStrokes?(strokes: readonly (readonly InkPoint[])[]): Promise<{ text: string; ink: { tex?: string; isUnsure: boolean } } | null>;
  readSpokenWords?(words: string, expects: SpokenExpected): Promise<SpokenReading>;
  writeRecap?(facts: RecapFacts): Promise<SessionRecap | null>;
  getSpentUsd?(): number;
}

export function makeTutorBrain({ roomName, trace }: { roomName: string; trace: TraceNote }): MadeBrain {
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
  const onTurnEnd = ({ firstTextMs, firstBeatMs, attempts, endedAs, costUsd, usage, refused, refusalCategory, isUsageEstimated, beats, spokenText }: TurnSummary) => {
    trace('turnWritten', { firstTextMs, firstBeatMs, attempts, endedAs, costUsd, usage, refused, refusalCategory, isUsageEstimated, words: spokenText.split(/\s+/).length });
    caps.addTurn({ usd: costUsd, voiceCharacters: beats.map(getBeatText).join(' ').length });
  };
  const brain = createTutorBrain({ model, loadProfile: link ? () => link.fetchProfile() : undefined, trace, onTurnEnd, getSpendLimit: caps.getSpendLimit });
  if (name === RECORDED) return { brain, flushSpend: caps.flush };
  const wordsModel = makeAnthropicTutorModel({ name: WORDS_MODEL, apiKey: readKey('ANTHROPIC_API_KEY') });
  const readMeaning = async (words: string) => {
    if (caps.getSpendLimit()) return null;
    const { meaning, costUsd } = await readWords(wordsModel, words);
    caps.addTurn({ usd: costUsd, voiceCharacters: 0 });
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
    const { recap, costUsd } = await writeLessonRecap(wordsModel, facts);
    caps.addTurn({ usd: costUsd, voiceCharacters: recap ? getRecapLines(recap).join(' ').length : 0 });
    return recap;
  };
  return { brain, flushSpend: caps.flush, getSpentUsd: caps.getSpentUsd, readMeaning, readStrokes, readSpokenWords, writeRecap };
}
