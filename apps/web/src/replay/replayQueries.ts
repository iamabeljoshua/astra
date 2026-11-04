import { parseSessionRecap, type SessionRecap } from '@astra/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { refreshSessionViews } from '../session/sessionQueries';
import { readReplayLesson, type ReplayLesson } from './replayLesson';

export interface SavedReplay {
  lesson: ReplayLesson;
  recap: SessionRecap | null;
  recapAnswer: string | null;
}

// A long lesson's log can run to megabytes, so it gets longer than the usual request.
const REPLAY_TIMEOUT_MS = 30_000;

export function useReplay(sessionId: string) {
  return useQuery({
    queryKey: ['sessions', 'replay', sessionId],
    // Read once per opening, because the player's clock is set from what it reads, and a later read must not move it under the student.
    staleTime: Infinity,
    gcTime: 0,
    queryFn: async ({ signal }): Promise<SavedReplay> => {
      const { runs, recap, recapAnswer } = await api.get('/sessions/{id}/replay', { signal, timeoutMs: REPLAY_TIMEOUT_MS, params: { path: { id: sessionId } } });
      const parsedRecap = parseSessionRecap(recap);
      return { lesson: readReplayLesson(runs), recap: parsedRecap.ok ? parsedRecap.value : null, recapAnswer };
    },
  });
}

export function useSaveRecapAnswer(sessionId: string) {
  return useMutation({ mutationFn: (answer: string) => api.put('/sessions/{id}/recap-answer', { params: { path: { id: sessionId } }, body: { answer } }) });
}

export function useDeleteReplay(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/sessions/{id}/replay', { params: { path: { id: sessionId } } }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['sessions', 'replay', sessionId] });
      queryClient.removeQueries({ queryKey: ['sessions', 'one', sessionId] });
      await refreshSessionViews(queryClient);
    },
  });
}
