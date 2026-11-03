import { MENU_LABELS, SIDEBAR_LABELS } from '../strings';

export function EmptySessionsPage() {
  return (
    <>
      <h1 className="text-title font-semibold">{MENU_LABELS.sessions}</h1>
      <p className="border-y border-line py-6 text-ink-2">{SIDEBAR_LABELS.noSessions}</p>
    </>
  );
}
