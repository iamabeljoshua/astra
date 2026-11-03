export const SESSION_STATUSES = ['in_progress', 'finished'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_LANGUAGES = ['en'] as const;
export type SessionLanguage = (typeof SESSION_LANGUAGES)[number];
