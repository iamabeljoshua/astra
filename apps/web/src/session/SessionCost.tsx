// Set by hand from the September 2026 rate, so a tester can see the cost in naira; VITE_NAIRA_PER_DOLLAR overrides it.
const NAIRA_PER_DOLLAR = Number(import.meta.env.VITE_NAIRA_PER_DOLLAR) || 1330;

const TITLE = `An estimate of this session so far: the model, the voice, and transcription. Naira at ₦${NAIRA_PER_DOLLAR.toLocaleString('en-NG')} to $1.`;

export const formatCost = (usd: number) => `$${usd.toFixed(usd < 1 ? 3 : 2)}`;

export const formatNaira = (usd: number, nairaPerDollar = NAIRA_PER_DOLLAR) => `₦${Math.round(usd * nairaPerDollar).toLocaleString('en-NG')}`;

export default function SessionCost({ usd }: { usd: number }) {
  return (
    <span data-testid="session-cost" title={TITLE} className="board-cost">
      {formatCost(usd)} · {formatNaira(usd)}
    </span>
  );
}
