import type { components } from '@astra/contracts';
import { HOME_LABELS } from '../strings';
import { DRAWINGS } from './drawings';

const PICK_IMAGES: Record<string, string> = {
  athens: '/picks/athens.jpg',
  saturn: '/picks/saturn.jpg',
  wave: '/picks/wave.jpg',
};

interface PickCardProps {
  pick: components['schemas']['PickCardResponseDto'];
  onChoose: () => void;
}

export function PickCard({ pick, onChoose }: PickCardProps) {
  return (
    <button
      type="button"
      onClick={onChoose}
      className="grid size-full grid-cols-pick items-start gap-3 border border-line p-2.5 text-left hover:border-ink"
    >
      <span aria-hidden className="block size-thumb overflow-hidden bg-panel">
        <PickPicture artwork={pick.artwork} />
      </span>
      <span className="min-w-0">
        <span className="label text-ink-2">{HOME_LABELS.pickDetails(pick.subject, pick.lengthMinutes)}</span>
        <span className="mt-px block leading-tight font-medium">{pick.title}</span>
        <span className="mt-0.5 block text-fine leading-fine text-ink-2">{pick.reason}</span>
      </span>
    </button>
  );
}

function PickPicture({ artwork }: { artwork: string }) {
  const Drawing = DRAWINGS[artwork];
  if (Drawing) return <Drawing className="thumb-strokes block size-full p-1.5" />;
  return <img src={PICK_IMAGES[artwork]} alt="" className="block size-full object-cover" />;
}
