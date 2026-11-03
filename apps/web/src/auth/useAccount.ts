import type { components } from '@astra/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { readWithRenewal } from './readWithRenewal';

const ACCOUNT_KEY = ['account'];
const HOME_KEY = ['home'];
const PARENT_ANSWER_CHECK_MS = 5_000;

type Account = Awaited<ReturnType<typeof readAccount>>;
type ProfileBody = components['schemas']['SaveStudentProfileBodyDto'];

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
    refetchInterval: ({ state }) => (state.data?.student?.parentConsent?.status === 'waiting' ? PARENT_ANSWER_CHECK_MS : false),
  });
}

function useSetAccountAfter<Input>(sendAnswer: (input: Input) => Promise<Account>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sendAnswer,
    // A read sent before this answer could land after it and put the old account back.
    onSuccess: async (account) => {
      await queryClient.cancelQueries({ queryKey: ACCOUNT_KEY });
      queryClient.setQueryData(ACCOUNT_KEY, account);
    },
  });
}

export function useAnswerBirthDate() {
  return useSetAccountAfter((body: { birthDate: string; name: string }) => api.post('/me/birth-date', { body }));
}

export function useAskParent() {
  return useSetAccountAfter((parentEmail: string) => api.put('/me/parent-consent', { body: { parentEmail } }));
}

export function useSaveProfile() {
  const queryClient = useQueryClient();
  return useSetAccountAfter(async (body: ProfileBody) => {
    const account = await api.put('/me/profile', { body });
    void queryClient.invalidateQueries({ queryKey: HOME_KEY });
    return account;
  });
}
