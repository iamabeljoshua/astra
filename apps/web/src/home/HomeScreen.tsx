import { useState, type PropsWithChildren } from 'react';
import type { ApiErrorKind } from '../api/apiError';
import { API_ERROR_LABELS, HOME_LABELS } from '../strings';
import { ChatBox } from './ChatBox';
import { ContinueCard } from './ContinueCard';
import { PickCard } from './PickCard';
import { useHomeScreen } from './useHomeScreen';

const PICK_PLACEHOLDER_COUNT = 6;
const PICK_GRID = 'grid grid-cols-3 gap-2.5 max-lg:grid-cols-2 max-md:grid-cols-1';

type HomeScreenQuery = ReturnType<typeof useHomeScreen>;

export function HomeScreen() {
  const homeScreen = useHomeScreen();
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <>
      <Greeting studentName={homeScreen.data?.studentName} />
      <HomeCards homeScreen={homeScreen} onChooseCard={() => setNotice(HOME_LABELS.sessionsOpenSoon)} />
      <div className="fades-with-theme sticky bottom-0 z-2 mt-auto -mb-page-bottom bg-paper pt-2.5 pb-3.5 max-md:-mx-page-side max-md:border-t max-md:border-line max-md:px-page-side max-md:py-2">
        <p role="status" className="text-fine text-ink-2">
          {notice && <span className="block pb-2">{notice}</span>}
        </p>
        <ChatBox
          onSend={() => setNotice(HOME_LABELS.sessionsOpenSoonQuestionKept)}
          onEdit={() => setNotice(null)}
        />
      </div>
    </>
  );
}

function Greeting({ studentName }: { studentName?: string }) {
  return (
    <header>
      <h1 className="font-voice text-greeting font-normal wrap-anywhere">
        {studentName ? HOME_LABELS.greeting(studentName) : HOME_LABELS.greetingWithoutName}
      </h1>
      <p className="mt-1 text-lead text-ink-2">{HOME_LABELS.question}</p>
    </header>
  );
}

function HomeCards({ homeScreen, onChooseCard }: { homeScreen: HomeScreenQuery; onChooseCard: () => void }) {
  if (homeScreen.data) return <LoadedCards homeScreenData={homeScreen.data} onChooseCard={onChooseCard} />;
  if (homeScreen.error) return <LoadFailure homeScreen={homeScreen} errorKind={homeScreen.error.kind} />;
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

function LoadFailure({ homeScreen, errorKind }: { homeScreen: HomeScreenQuery; errorKind: ApiErrorKind }) {
  return (
    <div className="flex flex-col items-start gap-3 border-y border-line py-6">
      <p className="text-ink-2">{API_ERROR_LABELS[errorKind]}</p>
      <button
        type="button"
        disabled={homeScreen.isFetching}
        onClick={() => homeScreen.refetch()}
        className="button button-outline"
      >
        {HOME_LABELS.tryAgain}
      </button>
    </div>
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
