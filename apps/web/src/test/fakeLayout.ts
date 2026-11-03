import { act } from '@testing-library/react';

const activeObservers = new Set<FakeResizeObserver>();

export class FakeResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe() {
    activeObservers.add(this);
  }

  unobserve() {
    activeObservers.delete(this);
  }

  disconnect() {
    activeObservers.delete(this);
  }

  notify() {
    this.callback([], this);
  }
}

export function notifyResizeObservers() {
  act(() => activeObservers.forEach((observer) => observer.notify()));
}

export const fakeFonts = { status: 'loaded', ready: Promise.resolve() };

export function startLoadingFont() {
  let finishLoading!: () => void;
  fakeFonts.status = 'loading';
  fakeFonts.ready = new Promise((resolve) => (finishLoading = resolve));

  return async function finishLoadingFont() {
    fakeFonts.status = 'loaded';
    finishLoading();
    await act(() => fakeFonts.ready);
  };
}
