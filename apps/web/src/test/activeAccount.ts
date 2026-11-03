const ACTIVE_ACCOUNT = {
  status: 'active',
  student: { id: '00000000-0000-4000-8000-000000000001', name: 'Maya', profile: null, parentConsentAt: null },
} as const;

export function useAccount() {
  return { isPending: false, error: null, data: ACTIVE_ACCOUNT, refetch: async () => undefined };
}
