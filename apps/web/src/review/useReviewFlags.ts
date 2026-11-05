import type { components } from '@astra/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const REVIEW_FLAGS_KEY = ['review-flags'];

export type ReviewFlag = components['schemas']['SafetyFlagResponseDto'];

export function useReviewFlags() {
  return useQuery({
    queryKey: REVIEW_FLAGS_KEY,
    queryFn: ({ signal }) => api.get('/review/flags', { signal }),
  });
}

export function useMarkReviewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (flagId: string) => api.post('/review/flags/{id}/reviewed', { params: { path: { id: flagId } } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REVIEW_FLAGS_KEY }),
  });
}
