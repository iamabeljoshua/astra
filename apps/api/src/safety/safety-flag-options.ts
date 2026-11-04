export const SAFETY_FLAG_KINDS = ['self_harm', 'abuse', 'danger', 'grooming', 'vague', 'tutor_slip'] as const;

export type SafetyFlagKind = (typeof SAFETY_FLAG_KINDS)[number];

export const SAFETY_FLAG_SOURCES = ['student', 'tutor'] as const;

export type SafetyFlagSource = (typeof SAFETY_FLAG_SOURCES)[number];
