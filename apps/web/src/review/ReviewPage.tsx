import { Navigate } from 'react-router';
import { ApiError } from '../api/apiError';
import { API_ERROR_LABELS, REVIEW_LABELS } from '../strings';
import { getWaitText } from './getWaitText';
import { type ReviewFlag, useMarkReviewed, useReviewFlags } from './useReviewFlags';

const NOT_FOUND_STATUS = 404;

const formatTime = (time: string) => new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const isHiddenFromThisUser = (error: unknown) => error instanceof ApiError && error.status === NOT_FOUND_STATUS;

export function ReviewPage() {
  const { data: flags, error } = useReviewFlags();

  if (isHiddenFromThisUser(error)) return <Navigate to="/" replace />;
  if (error) return <p role="alert" className="stop-note">{error instanceof ApiError ? API_ERROR_LABELS[error.kind] : REVIEW_LABELS.failed}</p>;
  if (!flags) return null;

  return (
    <>
      <title>{REVIEW_LABELS.pageTitle}</title>
      <header>
        <h1 tabIndex={-1} className="text-title font-semibold outline-none">{REVIEW_LABELS.pageTitle}</h1>
        <p className="mt-1 text-ink-2">{REVIEW_LABELS.about}</p>
      </header>
      {flags.length === 0 ? <p className="text-ink-2">{REVIEW_LABELS.empty}</p> : <FlagList flags={flags} />}
    </>
  );
}

function FlagList({ flags }: { flags: ReviewFlag[] }) {
  return (
    <ul className="flex flex-col">
      {flags.map((flag) => (
        <FlagRow key={flag.id} flag={flag} />
      ))}
    </ul>
  );
}

function FlagRow({ flag }: { flag: ReviewFlag }) {
  const markReviewed = useMarkReviewed();

  return (
    <li className="flex flex-col gap-2.5 border-t border-line py-4.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lead font-semibold">{REVIEW_LABELS.kinds[flag.kind]}</h2>
        <p className="text-fine text-ink-2">{formatTime(flag.createdAt)}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sub">
        <FlagFact label={REVIEW_LABELS.from} value={REVIEW_LABELS.sources[flag.source]} />
        <FlagFact label={REVIEW_LABELS.student} value={flag.studentId} />
        <FlagFact label={REVIEW_LABELS.session} value={flag.sessionId ?? REVIEW_LABELS.noSession} />
      </dl>
      {flag.reviewedAt ? (
        <p className="text-sub text-ink-2">{REVIEW_LABELS.reviewedAt(formatTime(flag.reviewedAt))}</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sub">{getWaitText(flag.createdAt, new Date())}</p>
          <button type="button" aria-disabled={markReviewed.isPending} onClick={() => !markReviewed.isPending && markReviewed.mutate(flag.id)} className="button">
            {REVIEW_LABELS.markReviewed}
          </button>
        </div>
      )}
      {markReviewed.isError && <p role="alert" className="stop-note">{REVIEW_LABELS.failed}</p>}
    </li>
  );
}

function FlagFact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink-2">{label}</dt>
      <dd className="min-w-0 break-all">{value}</dd>
    </>
  );
}
