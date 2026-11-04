import { getBeatText } from '@astra/contracts';
import { readKey } from '../keys.ts';
import { makeAnthropicTutorModel, TUTOR_MODEL_NAMES, type TutorModelName } from '../providers/anthropic.ts';
import { makeRecordedTutorModel } from '../providers/fake-model.ts';
import { createStandInTutor } from '../live/stand-in-tutor.ts';
import { createTutorBrain, type StudentProfile, type TraceNote, type TurnSummary, type TutorBrain } from './brain.ts';
import { TUTOR_SYSTEM } from './prompt.ts';
import { createSpendLedger } from './spend-ledger.ts';

const STAND_IN = 'stand-in';
const RECORDED = 'recorded';
const DEFAULT_MODEL: TutorModelName = 'sonnet-5-5';
const DEFAULT_LIMIT_USD = 8;
const DEFAULT_LIMIT_CREDITS = 1500;

// The API puts the profile on the room's dispatch, so the agent needs no database.
function readProfile(metadata: string | undefined): StudentProfile | null {
  if (!metadata) return null;
  const { level, interests, goal } = JSON.parse(metadata) as Partial<StudentProfile>;
  return typeof level === 'string' && typeof goal === 'string' && Array.isArray(interests) ? { level, goal, interests } : null;
}

function makeLedger() {
  const path = process.env.ASTRA_SPEND_FILE;
  if (!path) return null;
  return createSpendLedger(path, { limitUsd: Number(process.env.ASTRA_SPEND_LIMIT_USD ?? DEFAULT_LIMIT_USD), limitCredits: Number(process.env.ASTRA_SPEND_LIMIT_CREDITS ?? DEFAULT_LIMIT_CREDITS) });
}

export function makeTutorBrain({ jobMetadata, trace }: { jobMetadata: string | undefined; trace: TraceNote }): TutorBrain {
  const name = process.env.ASTRA_TUTOR_MODEL ?? DEFAULT_MODEL;
  if (name === STAND_IN) return createStandInTutor();
  if (name !== RECORDED && !TUTOR_MODEL_NAMES.includes(name as TutorModelName)) throw new Error(`ASTRA_TUTOR_MODEL is ${name}. Choose ${[STAND_IN, RECORDED, ...TUTOR_MODEL_NAMES].join(', ')}`);
  const ledger = makeLedger();
  const model = name === RECORDED ? makeRecordedTutorModel() : makeAnthropicTutorModel({ name: name as TutorModelName, apiKey: readKey('ANTHROPIC_API_KEY') });
  void model.warm(TUTOR_SYSTEM).catch((error: unknown) => trace('warmFailed', { problem: String(error) }));
  const onTurnEnd = ({ firstTextMs, firstBeatMs, attempts, endedAs, costUsd, usage, refused, refusalCategory, isUsageEstimated, beats, spokenText }: TurnSummary) => {
    trace('turnWritten', { firstTextMs, firstBeatMs, attempts, endedAs, costUsd, usage, refused, refusalCategory, isUsageEstimated, words: spokenText.split(/\s+/).length });
    ledger?.charge({ anthropicUsd: costUsd, voiceCharacters: beats.map(getBeatText).join(' ').length });
  };
  return createTutorBrain({ model, profile: readProfile(jobMetadata), trace, onTurnEnd, isOverBudget: () => ledger?.isOverModelLimit() ?? false });
}
