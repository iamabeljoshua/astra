export const SAFETY_KINDS = ['self_harm', 'abuse', 'danger', 'grooming'] as const;
export type SafetyKind = (typeof SAFETY_KINDS)[number];

/** A kind is danger said plainly, `vague` could be danger with nothing to explain it, and `unread` means the check failed, so nothing is known. */
export type StudentReading = SafetyKind | 'vague' | 'school' | 'none' | 'unread';

export const isSafetyKind = (reading: string): reading is SafetyKind => (SAFETY_KINDS as readonly string[]).includes(reading);
