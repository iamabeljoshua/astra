import type { components } from '@astra/contracts';
import { HOME_LABELS } from '../strings';
import { findArtwork, type Artwork } from './artwork';

interface ContinueCardProps {
  session: components['schemas']['SessionResponseDto'];
  onContinue: () => void;
}

export function ContinueCard({ session, onContinue }: ContinueCardProps) {
  const artwork = findArtwork(session.artwork);

  return (
    <section className={`${artwork ? 'grid-cols-continue max-md:grid-cols-1' : 'grid-cols-1'} fades-with-theme grid border border-line bg-panel`}>
      <div className="flex min-w-0 flex-col items-start gap-0.75 px-5 py-4.5">
        <span className="label text-ink-2">{HOME_LABELS.continueLabel}</span>
        <h2 className="mt-0.5 text-heading font-semibold wrap-anywhere">{session.title}</h2>
        <p className="mb-3 text-ink-2">{session.detail ?? session.subject}</p>
        <button type="button" onClick={onContinue} className="button button-solid">
          {HOME_LABELS.continueButton}
        </button>
      </div>
      {artwork && (
        <div className="flex min-w-0 items-center py-2.5 pr-4 max-md:hidden">
          <ContinuePicture artwork={artwork} />
        </div>
      )}
    </section>
  );
}

function ContinuePicture({ artwork }: { artwork: Artwork }) {
  if (artwork.kind === 'drawing') return <artwork.Drawing className="block h-auto max-h-continue-art-height w-full" />;
  return <img src={artwork.src} alt={artwork.description} className="block h-continue-art-height w-full object-cover" />;
}
