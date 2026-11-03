import type { PropsWithChildren } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { APP_ERROR_LABELS, PRODUCT_NAME } from './strings';

export function RootErrorBoundary({ children }: PropsWithChildren) {
  return <ErrorBoundary fallback={<CrashedPage />}>{children}</ErrorBoundary>;
}

function CrashedPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-page-side">
      <title>{PRODUCT_NAME}</title>
      <div role="alert" className="text-center">
        <h1 className="text-heading font-semibold">{APP_ERROR_LABELS.heading}</h1>
        <p className="mt-1 text-ink-2">{APP_ERROR_LABELS.message}</p>
      </div>
      <button type="button" onClick={() => window.location.reload()} className="button button-outline">
        {APP_ERROR_LABELS.reload}
      </button>
    </main>
  );
}
