export const ACCOUNT_STATUSES = ['needs_birth_date', 'active', 'closed'] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
