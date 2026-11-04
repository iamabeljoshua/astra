import { createSeededRandom, type DotPoint } from './dotPoint';

const FULL_TURN = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const PLANET_SEED = 67;
const PLANET_RADIUS = 0.44;

const SPHERE = { dotCount: 7600, jitter: 0.004, faintestChance: 0.05, chanceExponent: 1.6, smallestSize: 0.5, sizeFromLight: 0.55 };
const LIGHT_DIRECTION = { x: -0.5, y: -0.62, z: 0.6 };
const EDGE = { dotCount: 260, size: 0.62 };

const RING_TILT = -0.36;
const RING_FLATTEN = 0.27;
const RING_ANGLE_JITTER = 0.01;
const FAR_RING_SIZE = 0.72;
const NEAR_RING_SIZE = 1.08;
const FAR_RING_CLEARANCE = 1.06;
const RINGS = [
  { radius: 0.6, dotCount: 190 },
  { radius: 0.67, dotCount: 210 },
  { radius: 0.74, dotCount: 240 },
  { radius: 0.86, dotCount: 280 },
  { radius: 0.93, dotCount: 300 },
  { radius: 1, dotCount: 170 },
];

type Random = () => number;

// More dots land where the light falls, so the shading comes from how many dots there are as well as their size.
function getSphereDots(random: Random): DotPoint[] {
  const dots: DotPoint[] = [];
  for (let index = 0; index < SPHERE.dotCount; index += 1) {
    const y = 1 - (2 * (index + 0.5)) / SPHERE.dotCount;
    const ringRadius = Math.sqrt(1 - y * y);
    const x = Math.cos(index * GOLDEN_ANGLE) * ringRadius;
    const z = Math.sin(index * GOLDEN_ANGLE) * ringRadius;
    if (z < 0) continue;
    const light = Math.max(0, x * LIGHT_DIRECTION.x + y * LIGHT_DIRECTION.y + z * LIGHT_DIRECTION.z);
    if (random() > SPHERE.faintestChance + (1 - SPHERE.faintestChance) * light ** SPHERE.chanceExponent) continue;
    const jitterX = (random() - 0.5) * SPHERE.jitter;
    const jitterY = (random() - 0.5) * SPHERE.jitter;
    dots.push([x * PLANET_RADIUS + jitterX, y * PLANET_RADIUS + jitterY, SPHERE.smallestSize + SPHERE.sizeFromLight * light]);
  }
  return dots;
}

function getEdgeDots(): DotPoint[] {
  return Array.from({ length: EDGE.dotCount }, (_unused, index) => {
    const angle = (index / EDGE.dotCount) * FULL_TURN;
    return [Math.cos(angle) * PLANET_RADIUS, Math.sin(angle) * PLANET_RADIUS, EDGE.size];
  });
}

export interface RingDot {
  radius: number;
  angle: number;
}

// The far half of each ring is smaller and stops at the planet's edge, so the rings read as passing behind it.
export function getRingDotSpot({ radius, angle }: RingDot): DotPoint | null {
  const [tiltCos, tiltSin] = [Math.cos(RING_TILT), Math.sin(RING_TILT)];
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius * RING_FLATTEN;
  const isFar = Math.sin(angle) < 0;
  if (isFar && x * x + y * y < PLANET_RADIUS * PLANET_RADIUS * FAR_RING_CLEARANCE) return null;
  return [x * tiltCos - y * tiltSin, x * tiltSin + y * tiltCos, isFar ? FAR_RING_SIZE : NEAR_RING_SIZE];
}

function getRingDots({ radius, dotCount }: (typeof RINGS)[number], random: Random): RingDot[] {
  return Array.from({ length: dotCount }, (_unused, index) => ({ radius, angle: (index / dotCount) * FULL_TURN + random() * RING_ANGLE_JITTER }));
}

export function getPlanetParts(): { body: DotPoint[]; rings: RingDot[] } {
  const random = createSeededRandom(PLANET_SEED);
  const sphere = getSphereDots(random);
  return { body: [...sphere, ...getEdgeDots()], rings: RINGS.flatMap((ring) => getRingDots(ring, random)) };
}

export function getPlanetDots(): DotPoint[] {
  const { body, rings } = getPlanetParts();
  return [...body, ...rings.flatMap((ring) => {
    const spot = getRingDotSpot(ring);
    return spot ? [spot] : [];
  })];
}
