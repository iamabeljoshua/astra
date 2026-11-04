import type { Artwork } from '../home/artwork';

export function getSessionVisual(artwork: Artwork | null) {
  return artwork && <BoardPicture artwork={artwork} />;
}

export function BoardPicture({ artwork }: { artwork: Artwork }) {
  if (artwork.kind === 'drawing') return <artwork.Drawing className="block h-auto max-h-board-art w-full" />;
  return <img src={artwork.src} alt={artwork.description} className="block max-h-board-art max-w-full object-contain" />;
}
