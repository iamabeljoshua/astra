import type { components } from '@astra/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { HOME_SCREEN_KEY } from '../home/useHomeScreen';

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
    // After a failure too, because a note removed in another tab answers 404 here and should leave the list. Home is not on screen here, and its cards read these notes, so it refetches now.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: RECORD_KEY }),
        queryClient.invalidateQueries({ queryKey: HOME_SCREEN_KEY, refetchType: 'all' }),
      ]),
  });
}

export function useDeleteNote() {
  return useChangeRecord((noteId: string) => api.delete('/me/record/notes/{id}', { params: { path: { id: noteId } } }));
}

export function useDeleteRecord() {
  return useChangeRecord(() => api.delete('/me/record'));
}
