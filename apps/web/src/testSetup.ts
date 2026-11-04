import { cleanup, configure, getConfig } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { FakeResizeObserver, fakeFonts } from './test/fakeLayout';

globalThis.ResizeObserver = FakeResizeObserver;
Object.defineProperty(document, 'fonts', { configurable: true, value: fakeFonts });
window.scrollTo = () => undefined;
window.matchMedia = (() => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
HTMLCanvasElement.prototype.getContext = () => null;

const { asyncWrapper } = getConfig();
const nextTask = setImmediate;

// A wait ends at the commit that changed the page, and on a busy machine React runs that commit's effects one task later.
configure({
  asyncWrapper: (waitForPage) =>
    asyncWrapper(async () => {
      const result = await waitForPage();
      await new Promise(nextTask);
      return result;
    }),
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  for (const cookie of document.cookie.split('; ')) document.cookie = `${cookie.split('=')[0]}=; Max-Age=0; Path=/`;
  delete document.documentElement.dataset.theme;
  document.documentElement.style.visibility = '';
});
