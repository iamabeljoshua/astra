import { useEffect } from 'react';
import { Link } from 'react-router';
import { StepHeading } from '../auth/StepHeading';
import { LEGAL_LABELS, type LegalDocument, PRODUCT_NAME } from '../strings';
import { ThemeToggle } from '../theme/ThemeToggle';

// The window keeps its scroll across routes, so a reader starts at the top going in and coming back.
function useStartAtTheTop() {
  useEffect(() => {
    const scrollToTop = () => window.scrollTo(0, 0);
    scrollToTop();
    return scrollToTop;
  }, []);
}

export function LegalPage({ legalDocument }: { legalDocument: LegalDocument }) {
  useStartAtTheTop();

  return (
    <div className="mx-auto w-full max-w-onboarding px-4 pt-5 pb-5.5">
      <title>{LEGAL_LABELS.pageTitle(legalDocument.title)}</title>
      <div className="flex items-center justify-between">
        <div className="product-mark">{PRODUCT_NAME}</div>
        <ThemeToggle />
      </div>
      <main className="flex animate-arrive flex-col gap-4.5 py-6 max-md:py-4.5">
        <BackLink />
        <StepHeading>{legalDocument.title}</StepHeading>
        <p className="stop-note font-medium">{LEGAL_LABELS.draftNotice}</p>
        <p className="text-sub text-ink-2">{legalDocument.intro}</p>
        {legalDocument.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-2.5 border-t border-line pt-4.5">
            <h2 className="text-lead font-semibold">{section.heading}</h2>
            {section.today.map((statement) => (
              <p key={statement} className="text-sub">{statement}</p>
            ))}
            {section.planned.length > 0 && <PlannedStatements statements={section.planned} />}
          </section>
        ))}
        <div className="border-t border-line pt-4.5">
          <BackLink />
        </div>
      </main>
    </div>
  );
}

function PlannedStatements({ statements }: { statements: string[] }) {
  return (
    <div className="flex flex-col gap-2 border-l border-line pl-3">
      <p className="label text-ink-2">{LEGAL_LABELS.planned}</p>
      {statements.map((statement) => (
        <p key={statement} className="text-sub text-ink-2">{statement}</p>
      ))}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/" className="self-start text-fine font-medium text-ink-2 underline underline-offset-2 hover:text-accent">
      {LEGAL_LABELS.back}
    </Link>
  );
}
