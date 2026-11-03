import { useRef, type ComponentProps, type PropsWithChildren, type RefObject } from 'react';
import type { ApiErrorKind } from '../api/apiError';
import { ErrorBoundary } from '../ErrorBoundary';
import { useStartSession } from '../session/useStartSession';
import { HOME_LABELS } from '../strings';
import { ChatBox } from './ChatBox';
import { ContinueCard } from './ContinueCard';
import { PickCard } from './PickCard';
import { SlowStartNotice } from './SlowStartNotice';
import { useHomeScreen } from './useHomeScreen';
import { usePublishDockHeight } from './usePublishDockHeight';

const PICK_PLACEHOLDER_COUNT = 6;
const PICK_GRID = 'grid grid-cols-3 gap-2.5 max-lg:grid-cols-2 max-md:grid-cols-1';

type HomeScreenQuery = ReturnType<typeof useHomeScreen>;

export function HomeScreen() {
  const homeScreen = useHomeScreen();
  const { startFromQuestion, startFromPick, continueSession, isStarting, problem, clearProblem } = useStartSession();
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
          onChoosePick={startFromPick}
          onContinue={continueSession}
          onRetry={retryLoading}
        />
      </ErrorBoundary>
      <ChatDock problem={problem} isStarting={isStarting} onSend={startFromQuestion} onEdit={clearProblem} />
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
  problem: string | null;
  isStarting: boolean;
  onSend: ComponentProps<typeof ChatBox>['onSend'];
  onEdit: () => void;
}

function ChatDock({ problem, isStarting, onSend, onEdit }: ChatDockProps) {
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
        {problem && <span className="block pb-2">{problem}</span>}
        {isStarting && <SlowStartNotice />}
      </p>
      <ChatBox isSending={isStarting} onSend={onSend} onEdit={onEdit} />
    </div>
  );
}

interface CardActions {
  onChoosePick: ComponentProps<typeof PickCard>['onChoose'];
  onContinue: ComponentProps<typeof ContinueCard>['onContinue'];
}

interface HomeCardsProps extends CardActions {
  homeScreen: HomeScreenQuery;
  onRetry: () => void;
}

function HomeCards({ homeScreen, onChoosePick, onContinue, onRetry }: HomeCardsProps) {
  if (homeScreen.data) return <LoadedCards homeScreenData={homeScreen.data} onChoosePick={onChoosePick} onContinue={onContinue} />;
  if (homeScreen.error) return <LoadFailure errorKind={homeScreen.error.kind} onRetry={onRetry} />;
  return <HomeCardsPlaceholder />;
}

interface LoadedCardsProps extends CardActions {
  homeScreenData: NonNullable<HomeScreenQuery['data']>;
}

function LoadedCards({ homeScreenData: { continueSession, picks }, onChoosePick, onContinue }: LoadedCardsProps) {
  return (
    <>
      {continueSession && <ContinueCard session={continueSession} onContinue={onContinue} />}
      <PicksSection>
        <ul className={PICK_GRID}>
          {picks.map((pick) => (
            <li key={pick.id}>
              <PickCard pick={pick} onChoose={onChoosePick} />
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
  return (
    <>
      <p role="status" className="sr-only">
        {HOME_LABELS.loading}
      </p>
      <div className="fades-with-theme h-continue-placeholder border border-line bg-panel" />
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
