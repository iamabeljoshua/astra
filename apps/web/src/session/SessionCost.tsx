const TITLE = 'An estimate of this session so far: the model, the voice, and transcription.';

export const formatCost = (usd: number) => `$${usd.toFixed(2)}`;

// For Abel and testers, and only in a build that asked for it.
export default function SessionCost({ usd }: { usd: number }) {
  return (
    <span data-testid="session-cost" title={TITLE} className="board-cost">
      {formatCost(usd)}
    </span>
  );
}
