import type { components } from '@astra/contracts';
import type { ComponentType } from 'react';
import { ARTWORK_LABELS } from '../strings';
import { ArcDrawing, ForcesDrawing, GrowthDrawing, HelixDrawing, type DrawingProps } from './drawings';
import { getLineDrawing } from './lineDrawings';

type ArtworkName = components['schemas']['PickCardResponseDto']['artwork'];

export type Artwork =
  | { kind: 'drawing'; Drawing: ComponentType<DrawingProps> }
  | { kind: 'picture'; src: string; description: string };

const ARTWORK: Record<ArtworkName, Artwork> = {
  alchemist: { kind: 'picture', src: '/picks/alchemist.jpg', description: ARTWORK_LABELS.alchemist },
  arc: { kind: 'drawing', Drawing: ArcDrawing },
  athens: { kind: 'picture', src: '/picks/athens.jpg', description: ARTWORK_LABELS.athens },
  balance: { kind: 'drawing', Drawing: getLineDrawing('balance') },
  bars: { kind: 'drawing', Drawing: getLineDrawing('bars') },
  bastille: { kind: 'picture', src: '/picks/bastille.jpg', description: ARTWORK_LABELS.bastille },
  binary: { kind: 'drawing', Drawing: getLineDrawing('binary') },
  blackhole: { kind: 'picture', src: '/picks/blackhole.jpg', description: ARTWORK_LABELS.blackhole },
  braking: { kind: 'drawing', Drawing: getLineDrawing('braking') },
  branches: { kind: 'drawing', Drawing: getLineDrawing('branches') },
  cake: { kind: 'picture', src: '/picks/cake.jpg', description: ARTWORK_LABELS.cake },
  circuit: { kind: 'drawing', Drawing: getLineDrawing('circuit') },
  clock: { kind: 'drawing', Drawing: getLineDrawing('clock') },
  curve: { kind: 'drawing', Drawing: getLineDrawing('curve') },
  draughtsman: { kind: 'picture', src: '/picks/draughtsman.jpg', description: ARTWORK_LABELS.draughtsman },
  earth: { kind: 'picture', src: '/picks/earth.jpg', description: ARTWORK_LABELS.earth },
  earthrise: { kind: 'picture', src: '/picks/earthrise.jpg', description: ARTWORK_LABELS.earthrise },
  forces: { kind: 'drawing', Drawing: ForcesDrawing },
  frames: { kind: 'drawing', Drawing: getLineDrawing('frames') },
  grid: { kind: 'drawing', Drawing: getLineDrawing('grid') },
  growth: { kind: 'drawing', Drawing: GrowthDrawing },
  ham: { kind: 'picture', src: '/picks/ham.jpg', description: ARTWORK_LABELS.ham },
  helix: { kind: 'drawing', Drawing: HelixDrawing },
  indigo: { kind: 'picture', src: '/picks/indigo.jpg', description: ARTWORK_LABELS.indigo },
  launch: { kind: 'picture', src: '/picks/launch.jpg', description: ARTWORK_LABELS.launch },
  lock: { kind: 'drawing', Drawing: getLineDrawing('lock') },
  loom: { kind: 'picture', src: '/picks/loom.jpg', description: ARTWORK_LABELS.loom },
  lute: { kind: 'picture', src: '/picks/lute.jpg', description: ARTWORK_LABELS.lute },
  melencolia: { kind: 'picture', src: '/picks/melencolia.jpg', description: ARTWORK_LABELS.melencolia },
  nebula: { kind: 'picture', src: '/picks/nebula.jpg', description: ARTWORK_LABELS.nebula },
  parabola: { kind: 'drawing', Drawing: getLineDrawing('parabola') },
  piston: { kind: 'drawing', Drawing: getLineDrawing('piston') },
  pitch: { kind: 'drawing', Drawing: getLineDrawing('pitch') },
  prism: { kind: 'drawing', Drawing: getLineDrawing('prism') },
  pyramid: { kind: 'picture', src: '/picks/pyramid.jpg', description: ARTWORK_LABELS.pyramid },
  route: { kind: 'drawing', Drawing: getLineDrawing('route') },
  saturn: { kind: 'picture', src: '/picks/saturn.jpg', description: ARTWORK_LABELS.saturn },
  socrates: { kind: 'picture', src: '/picks/socrates.jpg', description: ARTWORK_LABELS.socrates },
  string: { kind: 'drawing', Drawing: getLineDrawing('string') },
  sunflowers: { kind: 'picture', src: '/picks/sunflowers.jpg', description: ARTWORK_LABELS.sunflowers },
  table: { kind: 'drawing', Drawing: getLineDrawing('table') },
  tangent: { kind: 'drawing', Drawing: getLineDrawing('tangent') },
  terrain: { kind: 'drawing', Drawing: getLineDrawing('terrain') },
  triangle: { kind: 'drawing', Drawing: getLineDrawing('triangle') },
  wave: { kind: 'picture', src: '/picks/wave.jpg', description: ARTWORK_LABELS.wave },
  waveform: { kind: 'drawing', Drawing: getLineDrawing('waveform') },
  wheat: { kind: 'picture', src: '/picks/wheat.jpg', description: ARTWORK_LABELS.wheat },
};

function isArtworkName(name: string): name is ArtworkName {
  return Object.hasOwn(ARTWORK, name);
}

export function findArtwork(nameFromApi: string | null): Artwork | null {
  return nameFromApi !== null && isArtworkName(nameFromApi) ? ARTWORK[nameFromApi] : null;
}
