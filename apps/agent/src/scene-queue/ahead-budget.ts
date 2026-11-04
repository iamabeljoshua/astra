/** What M3.15 measured a saved scene costs, used here only to ask whether one more would fit. */
export const AHEAD_WRITE_GUIDE_USD = 0.265;
export const MOST_WRITES_AHEAD = 2;
/** Two writes at the guide, so a session's scenes stop being written ahead well before the $0.80 they may cost in all. */
export const AHEAD_SCENE_CEILING_USD = 0.55;
/** About 80 spoken turns at $0.0072, so a student near their limit keeps their tutor rather than a picture. */
export const DAY_RESERVE_USD = 0.6;
const MOST_LOAD_PER_CORE = Number(process.env.ASTRA_SCENES_AHEAD_LOAD_PER_CORE ?? 1.5);
const SLOWEST_FIRST_TEXT_MS = 4000;

export interface AheadFacts {
  writesStarted: number;
  /** Everything this session's scenes have cost, asked for or ahead. */
  sceneUsd: number;
  sceneLimitUsd: number;
  /** Null until the API has answered once, and an unknown day prepares nothing. */
  leftTodayUsd: number | null;
  isOverLimit: boolean;
  loadPerCore: number;
  lastFirstTextMs: number | null;
}

export type PrepareRefusal = 'overLimit' | 'nearDayLimit' | 'pressure';
export type WriteRefusal = PrepareRefusal | 'writesAhead' | 'sceneCeiling';

const isUnderPressure = ({ loadPerCore, lastFirstTextMs }: AheadFacts) => loadPerCore > MOST_LOAD_PER_CORE || (lastFirstTextMs ?? 0) > SLOWEST_FIRST_TEXT_MS;

export function getPrepareRefusal(facts: AheadFacts): PrepareRefusal | null {
  if (facts.isOverLimit) return 'overLimit';
  if (facts.leftTodayUsd === null || facts.leftTodayUsd < DAY_RESERVE_USD) return 'nearDayLimit';
  return isUnderPressure(facts) ? 'pressure' : null;
}

export function getWriteRefusal(facts: AheadFacts): WriteRefusal | null {
  const refusal = getPrepareRefusal(facts);
  if (refusal) return refusal;
  if (facts.writesStarted >= MOST_WRITES_AHEAD) return 'writesAhead';
  const ceilingUsd = Math.min(AHEAD_SCENE_CEILING_USD, facts.sceneLimitUsd);
  return facts.sceneUsd + AHEAD_WRITE_GUIDE_USD > ceilingUsd ? 'sceneCeiling' : null;
}
