import { useRef, useState, type PropsWithChildren, type RefObject } from 'react';
import type { ApiErrorKind } from '../api/apiError';
import { ErrorBoundary } from '../ErrorBoundary';
import { HOME_LABELS } from '../strings';
import { ChatBox } from './ChatBox';
import { ContinueCard } from './ContinueCard';
import { PickCard } from './PickCard';
import { useHomeScreen } from './useHomeScreen';
import { useHasWaited } from './useHasWaited';
import { usePublishDockHeight } from './usePublishDockHeight';

const PICK_PLACEHOLDER_COUNT = 6;
const STILL_LOADING_AFTER_MS = 4_000;
const PICK_GRID = 'grid grid-cols-3 gap-2.5 max-lg:grid-cols-2 max-md:grid-cols-1';

type HomeScreenQuery = ReturnType<typeof useHomeScreen>;

export function HomeScreen() {
  const homeScreen = useHomeScreen();
  const [notice, setNotice] = useState<string | null>(null);
  const greeting = useRef<HTMLHeadingElement>(null);

  function retryLoading() {
    // Try again unmounts once the query restarts, so focus moves to the heading, which stays in every state.
    greeting.current?.focus();
    homeScreen.refetch();
  }

  return (
    <>
      <Greeting heading={greeting} studentName={homeScreen.data?.studentName} />
      <ErrorBoundary retryKey={homeScreen.dataUpdatedAt} fallback={<CardsCrash onRetry={retryLoading} />}>
        <HomeCards
          homeScreen={homeScreen}
          onChooseCard={() => setNotice(HOME_LABELS.sessionsOpenSoon)}
          onRetry={retryLoading}
        />
      </ErrorBoundary>
      <ChatDock
        notice={notice}
        onSend={() => setNotice(HOME_LABELS.sessionsOpenSoonQuestionKept)}
        onEdit={() => setNotice(null)}
      />
    </>
  );
}

function Greeting({ heading, studentName }: { heading: RefObject<HTMLHeadingElement | null>; studentName?: string | null }) {
  return (
    <header>
      <h1 ref={heading} tabIndex={-1} className="font-voice text-greeting font-normal wrap-anywhere outline-none">
        {studentName ? HOME_LABELS.greeting(studentName) : HOME_LABELS.greetingWithoutName}
      </h1>
      <p className="mt-1 text-lead text-ink-2">{HOME_LABELS.question}</p>
    </header>
  );
}

interface ChatDockProps {
  notice: string | null;
  onSend: () => void;
  onEdit: () => void;
}

function ChatDock({ notice, onSend, onEdit }: ChatDockProps) {
  const dock = useRef<HTMLDivElement>(null);
  usePublishDockHeight(dock);

  return (
    // -mb-page-bottom cancels main's bottom padding, so the box reaches the bottom of the window.
    // The shadow is the paper's own color and carries it 1px lower, so no card shows below the dock at a fractional display scale.
    <div
      ref={dock}
      data-dock
      className="fades-with-theme sticky bottom-0 z-2 mt-auto -mb-page-bottom bg-paper pt-2.5 pb-3.5 shadow-[0_1px_0_var(--color-paper)] max-md:-mx-page-side max-md:border-t max-md:border-line max-md:px-page-side max-md:py-2"
    >
      <p role="status" className="text-fine text-ink-2">
        {notice && <span className="block pb-2">{notice}</span>}
      </p>
      <ChatBox onSend={onSend} onEdit={onEdit} />
    </div>
  );
}

interface HomeCardsProps {
  homeScreen: HomeScreenQuery;
  onChooseCard: () => void;
  onRetry: () => void;
}

function HomeCards({ homeScreen, onChooseCard, onRetry }: HomeCardsProps) {
  if (homeScreen.data) return <LoadedCards homeScreenData={homeScreen.data} onChooseCard={onChooseCard} />;
  if (homeScreen.error) return <LoadFailure errorKind={homeScreen.error.kind} onRetry={onRetry} />;
  return <HomeCardsPlaceholder />;
}

interface LoadedCardsProps {
  homeScreenData: NonNullable<HomeScreenQuery['data']>;
  onChooseCard: () => void;
}

function LoadedCards({ homeScreenData: { continueSession, picks }, onChooseCard }: LoadedCardsProps) {
  return (
    <>
      {continueSession && <ContinueCard session={continueSession} onContinue={onChooseCard} />}
      <PicksSection>
        <ul className={PICK_GRID}>
          {picks.map((pick) => (
            <li key={pick.id}>
              <PickCard pick={pick} onChoose={onChooseCard} />
            </li>
          ))}
        </ul>
      </PicksSection>
    </>
  );
}

function CardsProblem({ onRetry, children }: PropsWithChildren<{ onRetry: () => void }>) {
  return (
    <div className="flex flex-col items-start gap-3 border-y border-line py-6">
      <div role="alert">{children}</div>
      <button type="button" onClick={onRetry} className="button button-outline">
        {HOME_LABELS.tryAgain}
      </button>
    </div>
  );
}

function LoadFailure({ errorKind, onRetry }: { errorKind: ApiErrorKind; onRetry: () => void }) {
  return (
    <CardsProblem onRetry={onRetry}>
      <p className="text-ink-2">{HOME_LABELS.loadFailure[errorKind]}</p>
    </CardsProblem>
  );
}

function CardsCrash({ onRetry }: { onRetry: () => void }) {
  return (
    <CardsProblem onRetry={onRetry}>
      <h2 className="font-medium">{HOME_LABELS.cardsCrashHeading}</h2>
      <p className="text-ink-2">{HOME_LABELS.cardsCrashMessage}</p>
    </CardsProblem>
  );
}

function HomeCardsPlaceholder() {
  const isTakingLong = useHasWaited(STILL_LOADING_AFTER_MS);

  return (
    <>
      <div className="fades-with-theme flex h-continue-placeholder items-center border border-line bg-panel px-5">
        <p role="status" className={isTakingLong ? 'text-ink-2' : 'sr-only'}>
          {isTakingLong ? HOME_LABELS.stillLoading : HOME_LABELS.loading}
        </p>
      </div>
      <PicksSection>
        <div className={PICK_GRID}>
          {Array.from({ length: PICK_PLACEHOLDER_COUNT }, (_unused, index) => (
            <div key={index} className="h-pick-placeholder border border-line" />
          ))}
        </div>
      </PicksSection>
    </>
  );
}

function PicksSection({ children }: PropsWithChildren) {
  return (
    <section>
      <h2 className="label mb-2.5 text-ink-2">{HOME_LABELS.picksLabel}</h2>
      {children}
    </section>
  );
}
