import { type PropsWithChildren, type RefObject, useEffect, useRef } from 'react';

const WIDE_SCREEN_QUERY = '(min-width: 761px)';

interface StepHeadingProps extends PropsWithChildren {
  id?: string;
  fieldToFocus?: RefObject<HTMLInputElement | null>;
}

// A new step takes focus so a screen reader announces it. A phone focuses the heading, because a field would open the keyboard over the question.
export function StepHeading({ id, fieldToFocus, children }: StepHeadingProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const isWideScreen = window.matchMedia(WIDE_SCREEN_QUERY).matches;
    const target = isWideScreen && fieldToFocus?.current ? fieldToFocus.current : heading.current;
    target?.focus({ preventScroll: true });
  }, [fieldToFocus]);

  return (
    <h1 ref={heading} id={id} tabIndex={-1} className="text-question font-semibold text-balance outline-none">
      {children}
    </h1>
  );
}
