export const SAFETY_KINDS = ['self_harm', 'abuse', 'danger', 'grooming'] as const;
export type SafetyKind = (typeof SAFETY_KINDS)[number];

/** What one read of a turn found. A kind is danger said plainly. `vague` could mean danger with nothing to explain it, `school` is ordinary school talk, and `unread` means the check failed, so nothing is known either way. */
export type StudentReading = SafetyKind | 'vague' | 'school' | 'none' | 'unread';

export const isSafetyKind = (reading: string): reading is SafetyKind => (SAFETY_KINDS as readonly string[]).includes(reading);
