import { type PropsWithChildren, type RefObject, useEffect, useRef } from 'react';

const WIDE_SCREEN_QUERY = '(min-width: 761px)';

interface StepHeadingProps extends PropsWithChildren {
  id?: string;
  describedBy?: string;
  fieldToFocus?: RefObject<HTMLElement | null>;
  className?: string;
}

// A phone focuses the heading, because a field would open the keyboard over the question.
export function StepHeading({ id, describedBy, fieldToFocus, className = 'text-question font-semibold', children }: StepHeadingProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const isWideScreen = window.matchMedia(WIDE_SCREEN_QUERY).matches;
    const target = isWideScreen && fieldToFocus?.current ? fieldToFocus.current : heading.current;
    target?.focus({ preventScroll: true });
  }, [fieldToFocus]);

  return (
    <h1 ref={heading} id={id} aria-describedby={describedBy} tabIndex={-1} className={`${className} text-balance wrap-anywhere outline-none`}>
      {children}
    </h1>
  );
}
