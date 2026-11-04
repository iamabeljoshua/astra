import type { DrawingName } from '@astra/contracts';
import type { InkPosition } from '../ink/ink-stroke.ts';

/** A place a label's line ends and a mark rings, in the sheet's own units. */
export interface SheetPart {
  x: number;
  y: number;
  radius: number;
}

/** One of our own line drawings. Strokes are in the order a hand would draw them, in units where the sheet is 100 wide. */
export interface DrawingSheet {
  height: number;
  strokes: readonly (readonly InkPosition[])[];
  parts: Readonly<Record<string, SheetPart>>;
}

const FULL_TURN = 2 * Math.PI;
const CURVE_STEPS = 32;

type Pair = readonly [number, number];

const makeLine = (...points: readonly Pair[]) => points.map(([x, y]) => ({ x, y }));

function makeEllipse({ x, y, width, height = width, turnRadians = 0, from = 0, to = FULL_TURN, steps = CURVE_STEPS }: { x: number; y: number; width: number; height?: number; turnRadians?: number; from?: number; to?: number; steps?: number }): InkPosition[] {
  return Array.from({ length: steps + 1 }, (_, step) => {
    const angle = from + ((to - from) * step) / steps;
    const across = Math.cos(angle) * width;
    const down = Math.sin(angle) * height;
    return { x: x + across * Math.cos(turnRadians) - down * Math.sin(turnRadians), y: y + across * Math.sin(turnRadians) + down * Math.cos(turnRadians) };
  });
}

const makeDot = (x: number, y: number, radius = 1) => makeEllipse({ x, y, width: radius, steps: 10 });

function makeWave({ fromX, toX, y, height, waves }: { fromX: number; toX: number; y: number; height: number; waves: number }): InkPosition[] {
  return Array.from({ length: CURVE_STEPS + 1 }, (_, step) => {
    const along = step / CURVE_STEPS;
    return { x: fromX + (toX - fromX) * along, y: y + Math.sin(along * waves * FULL_TURN) * height };
  });
}

const part = (x: number, y: number, radius = 4): SheetPart => ({ x, y, radius });

function drawAnimalCell(): DrawingSheet {
  const membrane = Array.from({ length: 49 }, (_, step) => {
    const angle = (step / 48) * FULL_TURN;
    const bulge = 1 + 0.05 * Math.sin(3 * angle) + 0.03 * Math.cos(5 * angle);
    return { x: 50 + 47 * bulge * Math.cos(angle), y: 41 + 36 * bulge * Math.sin(angle) };
  });
  return {
    height: 82,
    strokes: [
      membrane,
      makeEllipse({ x: 46, y: 39, width: 14, height: 13 }),
      makeDot(49, 36, 4),
      makeEllipse({ x: 73, y: 25, width: 9, height: 5, turnRadians: 0.4 }),
      makeWave({ fromX: 66, toX: 80, y: 25, height: 1.8, waves: 3 }),
      makeEllipse({ x: 26, y: 22, width: 8, height: 4.5, turnRadians: -0.5 }),
      makeEllipse({ x: 28, y: 60, width: 10, height: 7 }),
      makeDot(68, 54),
      makeDot(74, 58),
      makeDot(64, 62),
      makeDot(78, 48),
      makeDot(58, 66),
    ],
    parts: { membrane: part(94, 56, 3), nucleus: part(40, 38, 6), nucleolus: part(49, 36, 5), mitochondrion: part(73, 25, 9), vacuole: part(28, 60, 10), ribosome: part(70, 57, 8) },
  };
}

function drawFlower(): DrawingSheet {
  const petals = [0, 1, 2, 3, 4, 5].map((index) => {
    const angle = (index / 6) * FULL_TURN;
    return makeEllipse({ x: 50 + 11 * Math.cos(angle), y: 22 + 11 * Math.sin(angle), width: 8, height: 5, turnRadians: angle });
  });
  return {
    height: 100,
    strokes: [
      ...petals,
      makeDot(50, 22, 4),
      makeLine([50, 34], [51, 50], [49, 66], [50, 78]),
      makeLine([50, 58], [62, 48], [74, 47], [68, 56], [50, 58]),
      makeLine([50, 66], [38, 56], [26, 56], [32, 65], [50, 66]),
      makeLine([18, 78], [82, 78]),
      makeLine([50, 78], [50, 96]),
      makeLine([50, 82], [38, 94]),
      makeLine([50, 84], [62, 96]),
    ],
    parts: { petal: part(62, 15, 7), stamen: part(50, 22, 5), stem: part(50, 42, 3), leaf: part(66, 51, 7), root: part(58, 92, 6) },
  };
}

function drawWaterCycle(): DrawingSheet {
  const rays = [0, 1, 2, 3, 4, 5, 6, 7].map((index) => {
    const angle = (index / 8) * FULL_TURN;
    return makeLine([14 + 8 * Math.cos(angle), 13 + 8 * Math.sin(angle)], [14 + 11 * Math.cos(angle), 13 + 11 * Math.sin(angle)]);
  });
  const rain = [0, 1, 2, 3].map((index) => makeLine([56 + index * 6, 26], [54 + index * 6, 34]));
  return {
    height: 72,
    strokes: [
      makeEllipse({ x: 14, y: 13, width: 6 }),
      ...rays,
      makeEllipse({ x: 56, y: 17, width: 8, height: 6 }),
      makeEllipse({ x: 66, y: 13, width: 9, height: 7 }),
      makeEllipse({ x: 75, y: 18, width: 7, height: 5 }),
      ...rain,
      makeLine([54, 66], [74, 38], [94, 66]),
      makeLine([68, 66], [56, 62], [46, 66], [36, 63]),
      makeWave({ fromX: 3, toX: 36, y: 64, height: 1.2, waves: 3 }),
      makeWave({ fromX: 3, toX: 36, y: 68, height: 1.2, waves: 3 }),
      makeLine([14, 60], [14, 36]),
      makeLine([11, 40], [14, 36], [17, 40]),
      makeLine([26, 60], [26, 40]),
      makeLine([23, 44], [26, 40], [29, 44]),
    ],
    parts: { sun: part(14, 13, 8), cloud: part(66, 14, 13), rain: part(62, 30, 8), mountain: part(74, 44, 8), river: part(52, 63, 5), sea: part(18, 66, 9), evaporation: part(26, 48, 6) },
  };
}

function drawAtom(): DrawingSheet {
  const turns = [0, Math.PI / 3, (2 * Math.PI) / 3];
  const electrons = turns.map((turn, index) => {
    const angle = 0.9 + index * 1.7;
    const x = 46 * Math.cos(angle);
    const y = 16 * Math.sin(angle);
    return { x: 50 + x * Math.cos(turn) - y * Math.sin(turn), y: 44 + x * Math.sin(turn) + y * Math.cos(turn) };
  });
  return {
    height: 88,
    strokes: [...turns.map((turnRadians) => makeEllipse({ x: 50, y: 44, width: 46, height: 16, turnRadians })), makeDot(50, 44, 5), makeDot(47, 42, 2.4), makeDot(53, 46, 2.4), ...electrons.map(({ x, y }) => makeDot(x, y, 1.8))],
    parts: { nucleus: part(50, 44, 7), orbit: part(96, 44, 3), electron: part(electrons[0]?.x ?? 60, electrons[0]?.y ?? 50, 4) },
  };
}

function drawMusicStaff(): DrawingSheet {
  const lines = [12, 16, 20, 24, 28].map((y) => makeLine([2, y], [98, y]));
  const notes: readonly Pair[] = [[30, 24], [45, 20], [60, 16], [75, 22]];
  return {
    height: 40,
    strokes: [
      ...lines,
      makeLine([10, 36], [8, 34], [10, 32], [12, 34], [11, 8], [14, 6], [14, 12], [6, 22], [7, 28], [12, 28], [14, 24], [11, 20], [8, 23], [9, 26]),
      ...notes.flatMap(([x, y]) => [makeEllipse({ x, y, width: 2.1, height: 1.5, turnRadians: -0.4, steps: 14 }), makeLine([x + 2, y], [x + 2, y - 12])]),
      makeLine([90, 12], [90, 28]),
      makeLine([98, 12], [98, 28]),
    ],
    parts: { clef: part(10, 20, 8), staff: part(20, 12, 2), note: part(45, 20, 3.5), stem: part(47, 12, 2), 'bar-line': part(90, 20, 3) },
  };
}

function drawPianoKeys(): DrawingSheet {
  const whiteWidth = 96 / 7;
  const whites = Array.from({ length: 7 }, (_, index) => makeLine([2 + index * whiteWidth, 2], [2 + (index + 1) * whiteWidth, 2], [2 + (index + 1) * whiteWidth, 44], [2 + index * whiteWidth, 44], [2 + index * whiteWidth, 2]));
  const blacks = [1, 2, 4, 5, 6].flatMap((index) => {
    const x = 2 + index * whiteWidth;
    return [makeLine([x - 4, 2], [x + 4, 2], [x + 4, 28], [x - 4, 28], [x - 4, 2]), makeLine([x - 4, 8], [x + 4, 2], [x - 4, 16], [x + 4, 8], [x - 4, 24], [x + 4, 16], [x - 2, 28], [x + 4, 24])];
  });
  const keyPart = (index: number) => part(2 + (index + 0.5) * whiteWidth, 38, 4);
  return { height: 46, strokes: [...whites, ...blacks], parts: { c: keyPart(0), d: keyPart(1), e: keyPart(2), f: keyPart(3), g: keyPart(4), a: keyPart(5), b: keyPart(6), 'black-key': part(2 + whiteWidth, 15, 5) } };
}

function drawGlobe(): DrawingSheet {
  return {
    height: 100,
    strokes: [
      makeEllipse({ x: 50, y: 50, width: 46 }),
      makeEllipse({ x: 50, y: 50, width: 46, height: 8, from: 0, to: Math.PI, steps: 20 }),
      makeEllipse({ x: 50, y: 32, width: 41, height: 7, from: 0, to: Math.PI, steps: 20 }),
      makeEllipse({ x: 50, y: 68, width: 41, height: 7, from: 0, to: Math.PI, steps: 20 }),
      makeEllipse({ x: 50, y: 50, width: 18, height: 46, from: -Math.PI / 2, to: Math.PI / 2, steps: 20 }),
      makeEllipse({ x: 50, y: 50, width: 18, height: 46, from: Math.PI / 2, to: (3 * Math.PI) / 2, steps: 20 }),
      makeDot(50, 4),
      makeDot(50, 96),
    ],
    parts: { 'north-pole': part(50, 5, 3), 'south-pole': part(50, 95, 3), equator: part(90, 54, 3), tropic: part(12, 36, 3), meridian: part(68, 50, 3) },
  };
}

function drawLever(): DrawingSheet {
  return {
    height: 52,
    strokes: [
      makeLine([6, 22], [94, 22]),
      makeLine([34, 22], [26, 40], [42, 40], [34, 22]),
      makeLine([4, 40], [96, 40]),
      makeLine([8, 10], [22, 10], [22, 22], [8, 22], [8, 10]),
      makeLine([86, 2], [86, 20]),
      makeLine([83, 16], [86, 20], [89, 16]),
    ],
    parts: { beam: part(60, 22, 3), fulcrum: part(34, 32, 6), load: part(15, 16, 8), effort: part(86, 10, 5) },
  };
}

/** A hoop is drawn by the simulation it stands under, so it is not here. */
export const DRAWING_SHEETS: Partial<Record<DrawingName, DrawingSheet>> = {
  'animal-cell': drawAnimalCell(),
  flower: drawFlower(),
  'water-cycle': drawWaterCycle(),
  atom: drawAtom(),
  'music-staff': drawMusicStaff(),
  'piano-keys': drawPianoKeys(),
  globe: drawGlobe(),
  lever: drawLever(),
};
