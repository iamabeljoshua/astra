import { type PropsWithChildren, type RefObject, useRef } from 'react';
import { useFocusOnArrival } from './useFocusOnArrival';
import { useTypedLine } from './useTypedLine';

interface TutorQuestionProps extends PropsWithChildren {
  line: string;
  describedBy?: string;
  fieldToFocus?: RefObject<HTMLInputElement | null>;
}

// The field is in the page from the start and only hidden from sight, so focus and a screen reader never wait for the typing.
export function TutorQuestion({ line, describedBy, fieldToFocus, children }: TutorQuestionProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { typedLength, isTyping, finishTyping } = useTypedLine(line);
  useFocusOnArrival(heading, fieldToFocus);

  return (
    <div className="flex flex-col gap-6.5" onKeyDownCapture={finishTyping} onPointerDownCapture={finishTyping}>
      <div className="flex gap-4.5 font-voice text-tutor-line">
        <span className="flex h-[1.22em] flex-none items-center" aria-hidden="true">
          <span className={`block size-3 rounded-full bg-ink forced-color-adjust-none forced-colors:bg-[CanvasText] ${isTyping ? 'animate-speak' : ''}`} />
        </span>
        <h1 ref={heading} aria-describedby={describedBy} tabIndex={-1} className="font-normal text-balance outline-none">
          <span className="sr-only">{line}</span>
          <span aria-hidden="true">
            {line.slice(0, typedLength)}
            <span className="invisible">{line.slice(typedLength)}</span>
          </span>
        </h1>
      </div>
      <div className={`flex flex-col gap-4.5 pl-tutor-indent ${isTyping ? 'opacity-0' : 'animate-rise'}`}>{children}</div>
    </div>
  );
}
