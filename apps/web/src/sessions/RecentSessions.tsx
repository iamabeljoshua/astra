import { Link } from 'react-router';
import { getSessionPath } from '../session/sessionPath';
import { SIDEBAR_LABELS } from '../strings';
import { useRecentSessions } from './useSessionsList';

export function RecentSessions() {
  const { data: sessions, error } = useRecentSessions();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 px-2">
      <div className="label text-ink-2">{SIDEBAR_LABELS.recent}</div>
      {sessions && sessions.length > 0 && (
        <ul>
          {sessions.map((session) => (
            <li key={session.id}>
              <Link to={getSessionPath(session.id)} title={session.title} className="block truncate py-1 text-fine text-ink-2 hover:text-ink">
                {session.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {sessions?.length === 0 && <p className="text-fine text-ink-2">{SIDEBAR_LABELS.noSessions}</p>}
      {!sessions && error && <p className="text-fine text-ink-2">{SIDEBAR_LABELS.recentFailure}</p>}
    </div>
  );
}
