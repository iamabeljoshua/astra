import { type RefObject, useEffect } from 'react';

const WIDE_SCREEN_QUERY = '(min-width: 761px)';

// A phone focuses the heading, because a field would open the keyboard over the question.
export function useFocusOnArrival(heading: RefObject<HTMLElement | null>, field?: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const isWideScreen = window.matchMedia(WIDE_SCREEN_QUERY).matches;
    const target = isWideScreen && field?.current ? field.current : heading.current;
    target?.focus({ preventScroll: true });
  }, [heading, field]);
}
