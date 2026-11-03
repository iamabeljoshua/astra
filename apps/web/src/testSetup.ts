import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { FakeResizeObserver, fakeFonts } from './test/fakeLayout';

globalThis.ResizeObserver = FakeResizeObserver;
Object.defineProperty(document, 'fonts', { value: fakeFonts });
window.scrollTo = () => undefined;

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
