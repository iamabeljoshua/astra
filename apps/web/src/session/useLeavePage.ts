import { useEffect, useRef } from 'react';
import { type NavigateOptions, useNavigate } from 'react-router';
import { fadeOutPage } from './opening';

// A way out belongs to the page that started it: once that page has gone, its fade is undone and its navigation never runs.
export function useLeavePage() {
  const navigate = useNavigate();
  const pageLife = useRef(new AbortController());

  useEffect(() => {
    const life = new AbortController();
    pageLife.current = life;
    return () => life.abort();
  }, []);

  function getPageGoneSignal() {
    return pageLife.current.signal;
  }

  async function fadeInto(path: string, options?: NavigateOptions) {
    const pageGone = getPageGoneSignal();
    if (pageGone.aborted) return;
    await fadeOutPage(pageGone);
    if (!pageGone.aborted) navigate(path, options);
  }

  return { getPageGoneSignal, fadeInto };
}
