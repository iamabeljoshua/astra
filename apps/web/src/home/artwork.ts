import type { components } from '@astra/contracts';
import type { ComponentType } from 'react';
import { ARTWORK_LABELS } from '../strings';
import { ArcDrawing, ForcesDrawing, GrowthDrawing, HelixDrawing, type DrawingProps } from './drawings';

type ArtworkName = components['schemas']['PickCardResponseDto']['artwork'];

export type Artwork =
  | { kind: 'drawing'; Drawing: ComponentType<DrawingProps> }
  | { kind: 'picture'; src: string; description: string };

const ARTWORK: Record<ArtworkName, Artwork> = {
  arc: { kind: 'drawing', Drawing: ArcDrawing },
  athens: { kind: 'picture', src: '/picks/athens.jpg', description: ARTWORK_LABELS.athens },
  forces: { kind: 'drawing', Drawing: ForcesDrawing },
  growth: { kind: 'drawing', Drawing: GrowthDrawing },
  helix: { kind: 'drawing', Drawing: HelixDrawing },
  saturn: { kind: 'picture', src: '/picks/saturn.jpg', description: ARTWORK_LABELS.saturn },
  wave: { kind: 'picture', src: '/picks/wave.jpg', description: ARTWORK_LABELS.wave },
};

function isArtworkName(name: string): name is ArtworkName {
  return Object.hasOwn(ARTWORK, name);
}

export function findArtwork(nameFromApi: string | null): Artwork | null {
  return nameFromApi !== null && isArtworkName(nameFromApi) ? ARTWORK[nameFromApi] : null;
}
