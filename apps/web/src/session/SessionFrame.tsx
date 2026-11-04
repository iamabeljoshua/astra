import { lazy, type PropsWithChildren, type ReactNode, type RefObject, Suspense, useEffect, useRef } from 'react';
import { PRODUCT_NAME, SESSION_LABELS } from '../strings';
import { ThemeToggle } from '../theme/ThemeToggle';
import { formatSessionLength } from './formatSession';
import type { Session } from './sessionQueries';

export const BAR_ACTION = 'button button-outline px-3 py-1.25';

// A tester's flag, read at build time, so a build without it holds no cost line at all.
const SessionCost = import.meta.env.VITE_SHOW_COST === '1' ? lazy(() => import('./SessionCost')) : null;

// A card always starts with a picture and a rename takes it away, so a card with none has moved to the topic in its title. A typed question never had one, so nothing saved says it moved.
export function getBarSubject({ artwork, title, subject }: Session) {
  return !artwork && subject !== SESSION_LABELS.questionSubject ? title : subject;
}

export function SessionFacts({ subject, seconds, tutorStateLine, costUsd = null }: { subject: string; seconds: number; tutorStateLine?: RefObject<HTMLSpanElement | null>; costUsd?: number | null }) {
  return (
    <>
      <span className="label min-w-0 wrap-anywhere text-ink-2">{subject}</span>
      <span className="label text-ink-2">{formatSessionLength(seconds)}</span>
      {tutorStateLine && <span ref={tutorStateLine} data-testid="tutor-state" className="label text-ink-2" />}
      {SessionCost && costUsd !== null && (
        <Suspense fallback={null}>
          <SessionCost usd={costUsd} />
        </Suspense>
      )}
    </>
  );
}

interface SessionFrameProps extends PropsWithChildren {
  facts?: ReactNode;
  action?: ReactNode;
  problem?: string | null;
  isFullHeight?: boolean;
}

export function SessionFrame({ facts, action, problem, isFullHeight = false, children }: SessionFrameProps) {
  return (
    <div data-page className={`flex animate-arrive flex-col ${isFullHeight ? 'board-session' : 'min-h-dvh px-page-side'}`}>
      <title>{PRODUCT_NAME}</title>
      <header className={`flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line py-2.5 tabular-nums ${isFullHeight ? 'px-6 max-md:px-4' : ''}`}>
        <span className="product-mark">{PRODUCT_NAME}</span>
        {facts}
        <div className="ml-auto flex items-center gap-x-5">
          <ThemeToggle />
          {action}
        </div>
        {problem && <p role="alert" className="w-full text-fine text-ink-2 md:text-right">{problem}</p>}
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

// Focus was on what the student pressed, and that has gone, so it moves to the new screen's heading.
export function SessionTitle({ title, isQuiet = false }: { title: string; isQuiet?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  return (
    <h1 ref={heading} tabIndex={-1} className={`font-medium wrap-anywhere text-ink-2 outline-none ${isQuiet ? 'sr-only' : ''}`}>
      {title}
    </h1>
  );
}
