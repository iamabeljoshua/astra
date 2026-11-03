import { cleanup, configure, getConfig } from '@testing-library/react';
import { afterEach } from 'vitest';
import { FakeResizeObserver, fakeFonts } from './test/fakeLayout';

globalThis.ResizeObserver = FakeResizeObserver;
Object.defineProperty(document, 'fonts', { value: fakeFonts });
window.scrollTo = () => undefined;

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
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  for (const cookie of document.cookie.split('; ')) document.cookie = `${cookie.split('=')[0]}=; Max-Age=0; Path=/`;
  delete document.documentElement.dataset.theme;
});
