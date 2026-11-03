import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const ACCOUNT_KEY = ['account'];

export function useAccount() {
  return useQuery({
    queryKey: ACCOUNT_KEY,
    queryFn: ({ signal }) => api.get('/me', { signal }),
  });
}

export function useAnswerBirthDate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (birthDate: string) => api.post('/me/birth-date', { body: { birthDate } }),
    onSuccess: (account) => queryClient.setQueryData(ACCOUNT_KEY, account),
  });
}
