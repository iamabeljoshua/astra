import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryDevtools } from './api/QueryDevtools';
import { createQueryClient } from './api/queryClient';
import { AccountGate } from './auth/AccountGate';
import { AuthProvider } from './auth/AuthProvider';
import { useSignInDraft } from './auth/useSignInDraft';
import { LegalPage } from './legal/LegalPage';
import { LEGAL_PATHS } from './legal/legalPaths';
import { RootErrorBoundary } from './RootErrorBoundary';
import { SESSION_ROUTE } from './session/sessionPath';
import { SessionScreen } from './session/SessionScreen';
import { AppShell } from './shell/AppShell';
import { LEGAL_PAGES } from './strings';

const BoardDeckLab = import.meta.env.DEV ? lazy(() => import('./lab/BoardDeckLab')) : null;
const ScenePlayerLab = import.meta.env.DEV ? lazy(() => import('./lab/ScenePlayerLab')) : null;

function AppRoutes() {
  const signInDraft = useSignInDraft();

  return (
    <Routes>
      {ScenePlayerLab ? (
        <Route
          path="/lab/scene-player"
          element={
            <Suspense>
              <ScenePlayerLab />
            </Suspense>
          }
        />
      ) : null}
      {BoardDeckLab ? (
        <Route
          path="/lab/board-deck"
          element={
            <Suspense>
              <BoardDeckLab />
            </Suspense>
          }
        />
      ) : null}
      <Route path={LEGAL_PATHS.terms} element={<LegalPage legalDocument={LEGAL_PAGES.terms} />} />
      <Route path={LEGAL_PATHS.privacy} element={<LegalPage legalDocument={LEGAL_PAGES.privacy} />} />
      <Route
        path="*"
        element={
          <AccountGate signInDraft={signInDraft}>
            <SignedInRoutes />
          </AccountGate>
        }
      />
    </Routes>
  );
}

function SignedInRoutes() {
  return (
    <Routes>
      <Route path={SESSION_ROUTE} element={<SessionScreen />} />
      <Route path="*" element={<AppShell />} />
    </Routes>
  );
}

export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
        <QueryDevtools />
      </QueryClientProvider>
    </RootErrorBoundary>
  );
}
