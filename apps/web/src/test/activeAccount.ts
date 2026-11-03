const ACTIVE_ACCOUNT = {
  status: 'active',
  student: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Maya',
    profile: { interests: ['Space'], level: 'university', goal: 'exam', voice: 'ada', firstQuestion: 'How does a curveball bend?' },
    parentConsent: null,
  },
} as const;

export function useAccount() {
  return { error: null, data: ACTIVE_ACCOUNT, refetch: async () => undefined };
}
