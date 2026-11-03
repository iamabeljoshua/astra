import { Component, type PropsWithChildren } from 'react';
import { APP_ERROR_LABELS, PRODUCT_NAME } from './strings';

export class RootErrorBoundary extends Component<PropsWithChildren, { hasCrashed: boolean }> {
  state = { hasCrashed: false };

  static getDerivedStateFromError() {
    return { hasCrashed: true };
  }

  render() {
    if (!this.state.hasCrashed) return this.props.children;
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-page-side">
        <title>{PRODUCT_NAME}</title>
        <p>{APP_ERROR_LABELS.message}</p>
        <button type="button" onClick={() => window.location.reload()} className="button button-outline">
          {APP_ERROR_LABELS.reload}
        </button>
      </main>
    );
  }
}
