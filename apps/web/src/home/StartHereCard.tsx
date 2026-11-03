import { HOME_LABELS } from '../strings';

interface StartHereCardProps {
  question: string;
  onStart: () => void;
}

export function StartHereCard({ question, onStart }: StartHereCardProps) {
  return (
    <section className="fades-with-theme flex flex-col items-start gap-0.75 border border-line bg-panel px-5 py-4.5">
      <span className="label text-ink-2">{HOME_LABELS.startHereLabel}</span>
      <h2 className="mt-0.5 text-heading font-semibold wrap-anywhere">{question}</h2>
      <p className="mb-3 text-ink-2">{HOME_LABELS.startHereAbout}</p>
      <button type="button" onClick={onStart} className="button button-solid">
        {HOME_LABELS.startHereButton}
      </button>
    </section>
  );
}
