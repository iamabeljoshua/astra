import type { PropsWithChildren, ReactNode } from 'react';
import { PRODUCT_NAME, TUTOR_NOTES_LABELS } from '../strings';
import { ThemeToggle } from '../theme/ThemeToggle';

const NOTE_ROWS = [TUTOR_NOTES_LABELS.into, TUTOR_NOTES_LABELS.level, TUTOR_NOTES_LABELS.goal, TUTOR_NOTES_LABELS.voice];

interface OnboardingFrameProps extends PropsWithChildren {
  footer?: ReactNode;
}

export function OnboardingFrame({ children, footer }: OnboardingFrameProps) {
  return (
    <div className="grid min-h-dvh grid-cols-onboarding max-md:grid-cols-1 max-md:grid-rows-[auto_minmax(0,1fr)]">
      <title>{PRODUCT_NAME}</title>
      <div className="flex min-w-0 flex-col pt-5 pr-onboarding-side pb-5.5 pl-4 max-md:pr-4">
        <div className="mx-auto flex w-full max-w-onboarding flex-1 flex-col">
          <div className="flex items-center justify-between">
            <div className="product-mark">{PRODUCT_NAME}</div>
            <ThemeToggle />
          </div>
          <main className="flex flex-1 animate-arrive flex-col justify-center gap-4.5 py-6 max-md:justify-start max-md:py-4.5">
            {children}
          </main>
          <div className="flex min-h-10.5 items-center justify-between gap-3">{footer}</div>
        </div>
      </div>
      <TutorNotes />
    </div>
  );
}

function TutorNotes() {
  return (
    <div className="flex min-w-0 items-center justify-center border-l border-line bg-panel p-6 max-md:order-first max-md:justify-start max-md:border-b max-md:border-l-0 max-md:px-4 max-md:py-2">
      <div className="w-full max-w-sheet border border-line bg-paper px-5 pt-4.5 pb-4 max-md:max-w-none max-md:border-0 max-md:bg-transparent max-md:p-0">
        <div className="label flex items-center gap-2.5 text-ink-2 max-md:hidden">
          <i className="block size-2.5 flex-none rounded-full bg-ink" />
          <span>{TUTOR_NOTES_LABELS.title}</span>
        </div>
        <h2 className="mt-2.5 mb-3 font-voice text-sheet-name font-normal max-md:m-0 max-md:text-sheet-name-phone">
          {TUTOR_NOTES_LABELS.madeFor} {TUTOR_NOTES_LABELS.you}
        </h2>
        <dl className="max-md:hidden">
          {NOTE_ROWS.map((label) => (
            <div key={label} className="grid min-h-10 grid-cols-sheet-row items-baseline gap-2.5 border-t border-line py-2.25">
              <dt className="label text-ink-2">{label}</dt>
              <dd />
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
