import type { components } from '@astra/contracts';
import { HOME_LABELS } from '../strings';
import { findArtwork } from './artwork';
import { getPickReason } from './getPickReason';

type PickCardResponse = components['schemas']['PickCardResponseDto'];

interface PickCardProps {
  pick: PickCardResponse;
  onChoose: (pick: PickCardResponse) => void;
}

export function PickCard({ pick, onChoose }: PickCardProps) {
  return (
    <button
      type="button"
      onClick={() => onChoose(pick)}
      className="grid size-full grid-cols-pick items-start gap-3 border border-line p-2.5 text-left hover:border-ink"
    >
      <span aria-hidden className="block size-thumb overflow-hidden bg-panel">
        <PickPicture artworkName={pick.artwork} />
      </span>
      <span className="min-w-0">
        <span className="label text-ink-2">{HOME_LABELS.pickDetails(pick.subject, pick.lengthMinutes)}</span>
        <span className="mt-px block leading-tight font-medium">{pick.title}</span>
        <span className="mt-0.5 block text-fine leading-fine text-ink-2">{getPickReason(pick)}</span>
      </span>
    </button>
  );
}

function PickPicture({ artworkName }: { artworkName: PickCardResponse['artwork'] }) {
  const artwork = findArtwork(artworkName);
  if (!artwork) return null;
  if (artwork.kind === 'drawing') return <artwork.Drawing className="thumb-strokes block size-full p-1.5" />;
  return <img src={artwork.src} alt="" className="block size-full object-cover" />;
}
