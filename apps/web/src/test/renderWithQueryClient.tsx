import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createQueryClient } from '../api/queryClient';

export function renderWithQueryClient(component: ReactElement) {
  const queryClient = createQueryClient();
  const defaultOptions = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaultOptions, queries: { ...defaultOptions.queries, retry: false } });
  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}
