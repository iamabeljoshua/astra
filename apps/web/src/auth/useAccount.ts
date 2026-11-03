import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { readWithRenewal } from './readWithRenewal';

const ACCOUNT_KEY = ['account'];

type Account = Awaited<ReturnType<typeof readAccount>>;

function readAccount(signal: AbortSignal) {
  return api.get('/me', { signal });
}

export function useAccount() {
  return useQuery({
    queryKey: ACCOUNT_KEY,
    queryFn: ({ signal }): Promise<Account | null> => readWithRenewal(() => readAccount(signal)),
    // Null, not nothing, makes a new read keep the last error, so the error page stays in place while it runs.
    initialData: null,
    initialDataUpdatedAt: 0,
  });
}

export function useAnswerBirthDate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (birthDate: string) => api.post('/me/birth-date', { body: { birthDate } }),
    onSuccess: (account) => queryClient.setQueryData(ACCOUNT_KEY, account),
  });
}
