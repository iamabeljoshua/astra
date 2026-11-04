import { parseSessionRecap, type SessionRecap } from '@astra/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { refreshSessionViews } from '../session/sessionQueries';
import { readReplayLesson, type ReplayLesson } from './replayLesson';

export interface SavedReplay {
  lesson: ReplayLesson;
  recap: SessionRecap | null;
}

// A long lesson's log can run to megabytes, so it gets longer than the usual request.
const REPLAY_TIMEOUT_MS = 30_000;

export function useReplay(sessionId: string) {
  return useQuery({
    queryKey: ['sessions', 'replay', sessionId],
    queryFn: async ({ signal }): Promise<SavedReplay> => {
      const { runs, recap } = await api.get('/sessions/{id}/replay', { signal, timeoutMs: REPLAY_TIMEOUT_MS, params: { path: { id: sessionId } } });
      const parsedRecap = parseSessionRecap(recap);
      return { lesson: readReplayLesson(runs), recap: parsedRecap.ok ? parsedRecap.value : null };
    },
  });
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
