import { Component, type PropsWithChildren, type ReactNode } from 'react';

interface ErrorBoundaryProps extends PropsWithChildren {
  fallback: ReactNode;
  retryKey?: unknown;
}

interface ErrorBoundaryState {
  hasCrashed: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state = { hasCrashed: false };

  static getDerivedStateFromError() {
    return { hasCrashed: true };
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps, previousState: ErrorBoundaryState) {
    if (previousState.hasCrashed && previousProps.retryKey !== this.props.retryKey) {
      this.setState({ hasCrashed: false });
    }
  }

  render() {
    return this.state.hasCrashed ? this.props.fallback : this.props.children;
  }
}
