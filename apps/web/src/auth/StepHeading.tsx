import { type PropsWithChildren, type RefObject, useRef } from 'react';
import { useFocusOnArrival } from '../ui/useFocusOnArrival';

interface StepHeadingProps extends PropsWithChildren {
  id?: string;
  describedBy?: string;
  fieldToFocus?: RefObject<HTMLInputElement | null>;
  className?: string;
}

export function StepHeading({ id, describedBy, fieldToFocus, className = 'text-question', children }: StepHeadingProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useFocusOnArrival(heading, fieldToFocus);

  return (
    <h1 ref={heading} id={id} aria-describedby={describedBy} tabIndex={-1} className={`${className} font-semibold text-balance outline-none`}>
      {children}
    </h1>
  );
}
