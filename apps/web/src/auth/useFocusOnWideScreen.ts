import { type RefObject, useEffect } from 'react';

const WIDE_SCREEN_QUERY = '(min-width: 761px)';

// Focusing on a phone would open the keyboard over the question before the student has read it.
export function useFocusOnWideScreen(input: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    if (window.matchMedia(WIDE_SCREEN_QUERY).matches) input.current?.focus({ preventScroll: true });
  }, [input]);
}
