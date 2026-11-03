import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { api } from '../api/client';
import { StepHeading } from '../auth/StepHeading';
import { LEGAL_PATHS } from '../legal/legalPaths';
import { API_ERROR_LABELS, LEGAL_PAGES, PARENT_CONSENT_LABELS, PRODUCT_NAME } from '../strings';
import { ThemeToggle } from '../theme/ThemeToggle';

const AGREEMENT_LINK = 'underline underline-offset-2 hover:text-accent';
const REJECTED_KIND = 'rejected';

function useConsentLink(token: string) {
  const link = useQuery({
    queryKey: ['parent-consent', token],
    queryFn: ({ signal }) => api.get('/parent-consent/{token}', { params: { path: { token } }, signal }),
  });
  const accept = useMutation({
    mutationFn: () => api.post('/parent-consent/accept', { body: { token } }),
    onSuccess: () => link.refetch(),
  });
  return { link, accept };
}

export function ParentConsentPage() {
  const { token = '' } = useParams();
  const { link, accept } = useConsentLink(token);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-onboarding flex-col px-4 pt-5 pb-5.5">
      <title>{PRODUCT_NAME}</title>
      <div className="flex items-center justify-between">
        <div className="product-mark">{PRODUCT_NAME}</div>
        <ThemeToggle />
      </div>
      <main className="flex flex-1 animate-arrive flex-col justify-center gap-4.5 py-6 max-md:justify-start max-md:py-4.5">
        <ConsentContent link={link} accept={accept} />
      </main>
    </div>
  );
}

type ConsentLink = ReturnType<typeof useConsentLink>;

function ConsentContent({ link, accept }: ConsentLink) {
  if (link.data?.isAccepted) return <Accepted studentName={link.data.studentName} />;
  if (link.data) return <AskToAccept studentName={link.data.studentName} accept={accept} />;
  if (link.error?.kind === REJECTED_KIND) return <p role="alert" className="stop-note">{PARENT_CONSENT_LABELS.deadLink}</p>;
  if (link.error) return <LoadProblem problem={API_ERROR_LABELS[link.error.kind]} onTryAgain={() => void link.refetch()} />;
  return <p role="status" className="text-ink-2">{PARENT_CONSENT_LABELS.loading}</p>;
}

function LoadProblem({ problem, onTryAgain }: { problem: string; onTryAgain: () => void }) {
  return (
    <>
      <p role="alert" className="stop-note">{problem}</p>
      <div>
        <button type="button" className="button button-outline" onClick={onTryAgain}>{PARENT_CONSENT_LABELS.tryAgain}</button>
      </div>
    </>
  );
}

function AskToAccept({ studentName, accept }: { studentName: string | null; accept: ConsentLink['accept'] }) {
  const problem = accept.error && API_ERROR_LABELS[accept.error.kind];

  return (
    <>
      <StepHeading>{PARENT_CONSENT_LABELS.question(studentName)}</StepHeading>
      <p className="max-w-[56ch] text-sub text-ink-2">{PARENT_CONSENT_LABELS.about}</p>
      <p className="max-w-[56ch] text-sub text-ink-2">{PARENT_CONSENT_LABELS.stored}</p>
      <p className="max-w-[56ch] text-fine text-ink-2">
        {PARENT_CONSENT_LABELS.agreementStart}
        <Link to={LEGAL_PATHS.terms} className={AGREEMENT_LINK}>{LEGAL_PAGES.terms.title}</Link>
        {PARENT_CONSENT_LABELS.agreementJoin}
        <Link to={LEGAL_PATHS.privacy} className={AGREEMENT_LINK}>{LEGAL_PAGES.privacy.title}</Link>
        {PARENT_CONSENT_LABELS.agreementEnd}
      </p>
      {problem && <p role="alert" className="stop-note">{problem}</p>}
      <div>
        <button type="button" aria-disabled={accept.isPending} className="button button-solid" onClick={() => accept.mutate()}>
          {PARENT_CONSENT_LABELS.accept}
        </button>
      </div>
    </>
  );
}

function Accepted({ studentName }: { studentName: string | null }) {
  return (
    <>
      <StepHeading>{PARENT_CONSENT_LABELS.acceptedQuestion}</StepHeading>
      <p className="max-w-[46ch] text-sub text-ink-2 wrap-anywhere">{PARENT_CONSENT_LABELS.acceptedAbout(studentName)}</p>
    </>
  );
}
