export const ACCOUNT_STATUSES = ['needs_birth_date', 'active', 'closed'] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const PARENT_CONSENT_STATUSES = ['not_asked', 'waiting', 'given'] as const;

export type ParentConsentStatus = (typeof PARENT_CONSENT_STATUSES)[number];
