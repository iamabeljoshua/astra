import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter } from 'react-router';
import { QueryDevtools } from './api/QueryDevtools';
import { createQueryClient } from './api/queryClient';
import { AppShell } from './shell/AppShell';

export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
      <QueryDevtools />
    </QueryClientProvider>
  );
}
