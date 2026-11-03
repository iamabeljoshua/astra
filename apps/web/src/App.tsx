import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryDevtools } from './api/QueryDevtools';
import { createQueryClient } from './api/queryClient';
import { AccountGate } from './auth/AccountGate';
import { AuthProvider } from './auth/AuthProvider';
import { useSignInDraft } from './auth/useSignInDraft';
import { LegalPage } from './legal/LegalPage';
import { LEGAL_PATHS } from './legal/legalPaths';
import { RootErrorBoundary } from './RootErrorBoundary';
import { AppShell } from './shell/AppShell';
import { LEGAL_PAGES } from './strings';

function AppRoutes() {
  const signInDraft = useSignInDraft();

  return (
    <Routes>
      <Route path={LEGAL_PATHS.terms} element={<LegalPage legalDocument={LEGAL_PAGES.terms} />} />
      <Route path={LEGAL_PATHS.privacy} element={<LegalPage legalDocument={LEGAL_PAGES.privacy} />} />
      <Route
        path="*"
        element={
          <AccountGate signInDraft={signInDraft}>
            <AppShell />
          </AccountGate>
        }
      />
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
