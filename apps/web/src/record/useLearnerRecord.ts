import type { components } from '@astra/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { HOME_SCREEN_KEY, HOME_SCREEN_QUERY } from '../home/useHomeScreen';

export type LearnerNote = components['schemas']['LearnerNoteDto'];

const RECORD_KEY = ['learner-record'];

export function useLearnerRecord() {
  return useQuery({
    queryKey: RECORD_KEY,
    queryFn: ({ signal }) => api.get('/me/record', { signal }),
  });
}

function useChangeRecord<Input>(change: (input: Input) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    // After a failure too, because a note removed in another tab answers 404 here and should leave the list. Home's saved cards go first, so a removed note's reason can never show again.
    onSettled: () => {
      queryClient.removeQueries({ queryKey: HOME_SCREEN_KEY });
      void queryClient.prefetchQuery(HOME_SCREEN_QUERY);
      return queryClient.invalidateQueries({ queryKey: RECORD_KEY });
    },
  });
}

export function useDeleteNote() {
  return useChangeRecord((noteId: string) => api.delete('/me/record/notes/{id}', { params: { path: { id: noteId } } }));
}

export function useDeleteRecord() {
  return useChangeRecord(() => api.delete('/me/record'));
}
