export const AHEAD_WRITE_GUIDE_USD = 0.265;
export const MOST_WRITES_AHEAD = 2;
export const AHEAD_SCENE_CEILING_USD = 0.55;
export const DAY_RESERVE_USD = 0.6;
const MOST_LOAD_PER_CORE = Number(process.env.ASTRA_SCENES_AHEAD_LOAD_PER_CORE ?? 1.5);
const SLOWEST_FIRST_TEXT_MS = 4000;

export interface AheadFacts {
  writesStarted: number;
  sceneUsd: number;
  sceneLimitUsd: number;
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

export function getSavedRefusal({ isOverLimit, leftTodayUsd }: AheadFacts): PrepareRefusal | null {
  if (isOverLimit) return 'overLimit';
  return leftTodayUsd !== null && leftTodayUsd < DAY_RESERVE_USD ? 'nearDayLimit' : null;
}

export function getWriteRefusal(facts: AheadFacts): WriteRefusal | null {
  const refusal = getPrepareRefusal(facts);
  if (refusal) return refusal;
  if (facts.writesStarted >= MOST_WRITES_AHEAD) return 'writesAhead';
  const ceilingUsd = Math.min(AHEAD_SCENE_CEILING_USD, facts.sceneLimitUsd);
  return facts.sceneUsd + AHEAD_WRITE_GUIDE_USD > ceilingUsd ? 'sceneCeiling' : null;
}
