import type { PropsWithChildren, ReactNode } from 'react';
import { ONBOARDING_LABELS, PRODUCT_NAME, TUTOR_NOTES_LABELS } from '../strings';
import { ThemeToggle } from '../theme/ThemeToggle';
import { SignOutButton } from './SignOutButton';

export interface TutorNotesSheet {
  studentName: string;
  level: string;
  into: string;
  goal: string;
}

const EMPTY_SHEET: TutorNotesSheet = { studentName: '', level: '', into: '', goal: '' };

interface OnboardingLayoutProps extends PropsWithChildren {
  sheet?: TutorNotesSheet;
  showsChangeLaterNote?: boolean;
}

export function OnboardingLayout({ sheet = EMPTY_SHEET, showsChangeLaterNote = false, children }: OnboardingLayoutProps) {
  return (
    <div className="grid min-h-dvh grid-cols-onboarding max-md:grid-cols-1 max-md:grid-rows-[auto_minmax(0,1fr)]">
      <title>{PRODUCT_NAME}</title>
      {children}
      <TutorNotes sheet={sheet} showsChangeLaterNote={showsChangeLaterNote} />
    </div>
  );
}

interface OnboardingColumnProps extends PropsWithChildren {
  footer?: ReactNode;
  canSignOut?: boolean;
}

export function OnboardingColumn({ children, footer, canSignOut = false }: OnboardingColumnProps) {
  return (
    <div className="flex min-w-0 flex-col pt-5 pr-onboarding-side pb-5.5 pl-4 max-md:pr-4">
      <div className="mx-auto flex w-full max-w-onboarding flex-1 flex-col">
        <div className="flex items-center justify-between">
          <div className="product-mark">{PRODUCT_NAME}</div>
          <div className="flex items-center gap-4">
            {canSignOut && <SignOutButton className="text-fine font-medium text-ink-2 hover:text-ink" />}
            <ThemeToggle />
          </div>
        </div>
        <main className="flex flex-1 animate-arrive flex-col justify-center gap-4.5 py-6 max-md:justify-start max-md:py-4.5">
          {children}
        </main>
        <div className="flex min-h-10.5 items-center justify-between gap-3">{footer}</div>
      </div>
    </div>
  );
}

interface OnboardingFrameProps extends OnboardingColumnProps {
  showsChangeLaterNote?: boolean;
}

export function OnboardingFrame({ showsChangeLaterNote, ...column }: OnboardingFrameProps) {
  return (
    <OnboardingLayout showsChangeLaterNote={showsChangeLaterNote}>
      <OnboardingColumn {...column} />
    </OnboardingLayout>
  );
}

interface StepFooterProps {
  progress: string;
  onBack?: () => void;
  action?: ReactNode;
}

export function StepFooter({ progress, onBack, action }: StepFooterProps) {
  return (
    <>
      {onBack ? (
        <button type="button" className="font-medium text-ink-2 hover:text-ink" onClick={onBack}>
          {ONBOARDING_LABELS.back}
        </button>
      ) : (
        <span />
      )}
      <span className="label text-ink-2">{progress}</span>
      {action ?? <span />}
    </>
  );
}

interface TutorNotesProps {
  sheet: TutorNotesSheet;
  showsChangeLaterNote: boolean;
}

function TutorNotes({ sheet, showsChangeLaterNote }: TutorNotesProps) {
  const rows = [
    { label: TUTOR_NOTES_LABELS.level, value: sheet.level },
    { label: TUTOR_NOTES_LABELS.into, value: sheet.into },
    { label: TUTOR_NOTES_LABELS.goal, value: sheet.goal },
  ];

  return (
    <div className="flex min-w-0 items-center justify-center border-l border-line bg-panel p-6 max-md:order-first max-md:justify-start max-md:border-b max-md:border-l-0 max-md:px-4 max-md:py-2">
      <div className="w-full max-w-sheet border border-line bg-paper px-5 pt-4.5 pb-4 max-md:flex max-md:max-w-none max-md:flex-wrap max-md:items-baseline max-md:gap-2.5 max-md:border-0 max-md:bg-transparent max-md:p-0">
        <div className="label flex items-center gap-2.5 text-ink-2 max-md:hidden">
          <i className="block size-2.5 flex-none rounded-full bg-ink forced-color-adjust-none forced-colors:bg-[CanvasText]" />
          <span>{TUTOR_NOTES_LABELS.title}</span>
        </div>
        <h2 className="mt-2.5 mb-3 font-voice text-sheet-name font-normal wrap-anywhere max-md:m-0 max-md:text-sheet-name-phone">
          {TUTOR_NOTES_LABELS.madeFor} {sheet.studentName.trim() || TUTOR_NOTES_LABELS.you}
        </h2>
        <dl className="max-md:contents">
          {rows.map(({ label, value }) => (
            <div
              key={label}
              className={`${value ? '' : 'max-md:hidden'} grid min-h-10 grid-cols-sheet-row items-baseline gap-2.5 border-t border-line py-2.25 max-md:block max-md:min-h-0 max-md:border-0 max-md:p-0 max-md:text-fine max-md:text-ink-2`}
            >
              <dt className="label text-ink-2 max-md:hidden">{label}</dt>
              <dd key={value ? 'restart-fade-when-filled' : 'empty'} className="animate-arrive font-medium wrap-anywhere max-md:font-normal">{value}</dd>
            </div>
          ))}
        </dl>
        {showsChangeLaterNote && <p className="border-t border-line pt-2.5 text-fine text-ink-2 max-md:hidden">{TUTOR_NOTES_LABELS.footer}</p>}
      </div>
    </div>
  );
}
