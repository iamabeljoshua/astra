export const ARTWORK_NAMES = ['arc', 'athens', 'forces', 'growth', 'helix', 'saturn', 'wave'] as const;
export type ArtworkName = (typeof ARTWORK_NAMES)[number];
