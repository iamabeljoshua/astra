import { createSeededRandom, type DotPoint } from './dotPoint';
import { getPlanetParts, getRingDotSpot, type RingDot } from './planetDots';

const GRID_GAP = 22;
const GATHER_MS = 3200;
const LONGEST_WAIT_MS = 1400;
export const RETURN_MS = 500;
const RING_TURN_MS = 150_000;
const BODY_DOTS_KEPT_ONE_IN = 2;
const RING_DOTS_KEPT_ONE_IN = 2;
const FULL_TURN = Math.PI * 2;
const SATURN_SHARE_OF_SIDE = 0.36;
const SEED = 4217;

export interface GridDot {
  x: number;
  y: number;
}

interface GatherDot {
  home: GridDot;
  waitMs: number;
  body: DotPoint | null;
  ring: RingDot | null;
}

export interface Gathering {
  grid: readonly GridDot[];
  dots: readonly GatherDot[];
  center: GridDot;
  scale: number;
}

const { body: BODY, rings: RINGS } = getPlanetParts();
const KEPT_BODY = BODY.filter((_dot, index) => index % BODY_DOTS_KEPT_ONE_IN === 0);
const KEPT_RINGS = RINGS.filter((_dot, index) => index % RING_DOTS_KEPT_ONE_IN === 0);

const getRestingX = (dot: Pick<GatherDot, 'body' | 'ring'>) => dot.body?.[0] ?? (dot.ring ? Math.cos(dot.ring.angle) * dot.ring.radius : 0);

/** Each dot starts on the grid near the middle, in the same left to right order as where it is going, so they drift and never swarm. */
export function createGathering(width: number, height: number): Gathering {
  const grid: GridDot[] = [];
  for (let y = GRID_GAP / 2; y < height; y += GRID_GAP) for (let x = GRID_GAP / 2; x < width; x += GRID_GAP) grid.push({ x, y });
  const center = { x: width / 2, y: height / 2 };
  const random = createSeededRandom(SEED);
  const going = [...KEPT_BODY.map((body) => ({ body, ring: null })), ...KEPT_RINGS.map((ring) => ({ body: null, ring }))].sort((first, second) => getRestingX(first) - getRestingX(second));
  const nearest = [...grid].sort((first, second) => Math.hypot(first.x - center.x, first.y - center.y) - Math.hypot(second.x - center.x, second.y - center.y)).slice(0, going.length).sort((first, second) => first.x - second.x);
  const dots = going.map((dot, index) => ({ ...dot, home: nearest[index % Math.max(1, nearest.length)] ?? center, waitMs: random() * LONGEST_WAIT_MS }));
  return { grid, dots, center, scale: Math.min(width, height) * SATURN_SHARE_OF_SIDE };
}

const easeInOut = (share: number) => {
  const clamped = Math.min(1, Math.max(0, share));
  return clamped * clamped * (3 - 2 * clamped);
};

interface GatherMoment {
  /** How long the dots have been gathering, or null for a picture that does not move. */
  gatheredMs: number | null;
  /** How long since the tutor connected and the dots started home, or null if it has not. */
  returnedMs: number | null;
  /** How far the rings have turned, which keeps going however long the wait, and never starts over. */
  turnedMs: number;
}

function getSpot({ body, ring }: GatherDot, turnedMs: number): DotPoint | null {
  if (body) return body;
  return ring && getRingDotSpot({ radius: ring.radius, angle: ring.angle + (turnedMs / RING_TURN_MS) * FULL_TURN });
}

/** Where a dot is now, in pixels, with its size and how far it has come. A ring dot passing behind the planet has no place. */
export function getGatherDot({ center, scale }: Pick<Gathering, 'center' | 'scale'>, dot: GatherDot, { gatheredMs, returnedMs, turnedMs }: GatherMoment): [x: number, y: number, size: number, share: number] | null {
  const spot = getSpot(dot, turnedMs);
  if (!spot) return null;
  const [x, y, size = 1] = spot;
  const gathered = gatheredMs === null ? 1 : easeInOut((gatheredMs - dot.waitMs) / GATHER_MS);
  const staying = gathered * (1 - (returnedMs === null ? 0 : easeInOut(returnedMs / RETURN_MS)));
  return [dot.home.x + (center.x + x * scale - dot.home.x) * staying, dot.home.y + (center.y + y * scale - dot.home.y) * staying, size, staying];
}
