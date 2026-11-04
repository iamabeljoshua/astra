export type DotPoint = readonly [x: number, y: number, size?: number];

const RANDOM_MULTIPLIER = 1664525;
const RANDOM_INCREMENT = 1013904223;
const RANDOM_RANGE = 4294967296;

export function createSeededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * RANDOM_MULTIPLIER + RANDOM_INCREMENT) % RANDOM_RANGE;
    return state / RANDOM_RANGE;
  };
}
