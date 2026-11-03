import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter } from 'react-router';
import { QueryDevtools } from './api/QueryDevtools';
import { createQueryClient } from './api/queryClient';
import { AccountGate } from './auth/AccountGate';
import { AuthProvider } from './auth/AuthProvider';
import { AppShell } from './shell/AppShell';

export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AccountGate>
            <AppShell />
          </AccountGate>
        </BrowserRouter>
      </AuthProvider>
      <QueryDevtools />
    </QueryClientProvider>
  );
}
