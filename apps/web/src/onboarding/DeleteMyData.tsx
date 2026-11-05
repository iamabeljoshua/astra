import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../api/apiError';
import { api } from '../api/client';
import { signOut } from '../auth/session';
import { API_ERROR_LABELS, DELETE_DATA_LABELS } from '../strings';

function useDeleteMyData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/me'),
    onSuccess: () => {
      queryClient.clear();
      signOut();
    },
  });
}

export function DeleteMyData() {
  const [isConfirming, setIsConfirming] = useState(false);
  const deleteMyData = useDeleteMyData();
  const { error } = deleteMyData;

  return (
    <section className="flex max-w-onboarding flex-col gap-2.5 border-t border-line pt-4.5">
      <h2 className="label text-ink-2">{DELETE_DATA_LABELS.title}</h2>
      {isConfirming ? (
        <>
          <p className="text-sub">{DELETE_DATA_LABELS.confirm}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" aria-disabled={deleteMyData.isPending} onClick={() => !deleteMyData.isPending && deleteMyData.mutate()} className="button button-solid">
              {deleteMyData.isPending ? DELETE_DATA_LABELS.deleting : DELETE_DATA_LABELS.yes}
            </button>
            <button type="button" onClick={() => setIsConfirming(false)} className="button">{DELETE_DATA_LABELS.no}</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sub text-ink-2">{DELETE_DATA_LABELS.about}</p>
          <button type="button" onClick={() => setIsConfirming(true)} className="button self-start">{DELETE_DATA_LABELS.title}</button>
        </>
      )}
      {error && <p role="alert" className="stop-note">{error instanceof ApiError ? API_ERROR_LABELS[error.kind] : DELETE_DATA_LABELS.failed}</p>}
    </section>
  );
}
