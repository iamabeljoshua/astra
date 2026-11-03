import { useState } from 'react';
import { Link } from 'react-router';
import type { ApiErrorKind } from '../api/apiError';
import { formatSessionDate, formatSessionLength } from '../session/formatSession';
import { getSessionPath } from '../session/sessionPath';
import type { Session } from '../session/sessionQueries';
import { API_ERROR_LABELS, MENU_LABELS, SESSIONS_LABELS, SIDEBAR_LABELS } from '../strings';
import { useDebouncedValue } from './useDebouncedValue';
import { useSessionsList } from './useSessionsList';

const SEARCH_WAIT_MS = 250;
const API_MAX_SEARCH_CHARACTERS = 200;
const COLUMN_HEADING = 'py-2 pr-3 text-left font-medium';
const WIDE_COLUMN = 'py-2.75 pr-3 align-baseline text-ink-2 max-md:hidden';

export function SessionsPage() {
  const [search, setSearch] = useState('');
  const settledSearch = useDebouncedValue(search.trim(), SEARCH_WAIT_MS);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3.5">
        <h1 tabIndex={-1} className="text-title font-semibold outline-none">{MENU_LABELS.sessions}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            maxLength={API_MAX_SEARCH_CHARACTERS}
            aria-label={SESSIONS_LABELS.search}
            placeholder={SESSIONS_LABELS.search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-58 max-w-full border-b border-ink py-1.75 outline-none placeholder:text-ink-2 focus:border-b-2 focus:pb-1.5"
          />
          <Link to="/" className="button button-solid">{SESSIONS_LABELS.newSession}</Link>
        </div>
      </header>
      <SessionsList search={settledSearch} />
    </>
  );
}

function SessionsList({ search }: { search: string }) {
  const list = useSessionsList(search);

  if (list.data?.length === 0) return <EmptyList message={search ? SESSIONS_LABELS.noMatch : SIDEBAR_LABELS.noSessions} />;
  if (list.data) return <LoadedList sessions={list.data} list={list} />;
  if (list.error) return <ListFailure list={list} errorKind={list.error.kind} />;
  return <p role="status" className="sr-only">{SESSIONS_LABELS.loading}</p>;
}

type SessionsListQuery = ReturnType<typeof useSessionsList>;

function LoadedList({ sessions, list }: { sessions: Session[]; list: SessionsListQuery }) {
  return (
    <>
      <SessionsTable sessions={sessions} />
      {list.hasNextPage && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" aria-disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} className="button button-outline">
            {SESSIONS_LABELS.showMore}
          </button>
          {list.isFetchNextPageError && <p role="alert" className="text-fine text-ink-2">{API_ERROR_LABELS[list.error.kind]}</p>}
        </div>
      )}
    </>
  );
}

function ListFailure({ list, errorKind }: { list: SessionsListQuery; errorKind: ApiErrorKind }) {
  return (
    <div className="flex flex-col items-start gap-3 border-y border-line py-6">
      <p role="alert" className="text-ink-2">{API_ERROR_LABELS[errorKind]}</p>
      <button type="button" aria-disabled={list.isFetching} onClick={() => void list.refetch()} className="button button-outline">
        {SESSIONS_LABELS.tryAgain}
      </button>
    </div>
  );
}

function EmptyList({ message }: { message: string }) {
  return <p className="border-y border-line py-6 text-ink-2">{message}</p>;
}

function SessionsTable({ sessions }: { sessions: Session[] }) {
  const { columns } = SESSIONS_LABELS;

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="label border-b border-ink text-ink-2">
          <th scope="col" className={COLUMN_HEADING}>{columns.session}</th>
          <th scope="col" className={`${COLUMN_HEADING} max-md:hidden`}>{columns.subject}</th>
          <th scope="col" className={`${COLUMN_HEADING} max-md:hidden`}>{columns.date}</th>
          <th scope="col" className={`${COLUMN_HEADING} max-md:hidden`}>{columns.length}</th>
          <th scope="col" className={COLUMN_HEADING}>{columns.status}</th>
          <th scope="col" className="sr-only">{columns.open}</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((session) => (
          <SessionRow key={session.id} session={session} />
        ))}
      </tbody>
    </table>
  );
}

// The title's link stretches over the row, so the whole row opens the session with one stop for the keyboard.
function SessionRow({ session }: { session: Session }) {
  const date = formatSessionDate(session.startedAt);
  const length = formatSessionLength(session.durationSeconds);
  const isFinished = session.status === 'finished';

  return (
    <tr className="group relative border-b border-line tabular-nums">
      <td className="py-2.75 pr-3 align-baseline wrap-anywhere">
        <Link to={getSessionPath(session.id)} className="font-medium underline-offset-3 group-hover:underline after:absolute after:inset-0">
          {session.title}
        </Link>
        <span className="mt-0.5 block text-fine text-ink-2 md:hidden">{SESSIONS_LABELS.rowDetails(session.subject, date, length)}</span>
      </td>
      <td className={`${WIDE_COLUMN} wrap-anywhere`}>{session.subject}</td>
      <td className={`${WIDE_COLUMN} whitespace-nowrap`}>{date}</td>
      <td className={WIDE_COLUMN}>{length}</td>
      <td className="py-2.75 pr-3 align-baseline whitespace-nowrap text-ink-2">{SESSIONS_LABELS.statuses[session.status]}</td>
      <td aria-hidden className="py-2.75 text-right align-baseline font-medium whitespace-nowrap">
        {isFinished ? SESSIONS_LABELS.open : SESSIONS_LABELS.resume}
      </td>
    </tr>
  );
}
