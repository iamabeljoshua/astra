import { PROMPT_V1 } from './prompts/v1.ts';
import { PROMPT_V2, TURN_NOTE_V2 } from './prompts/v2.ts';
import { FIT_NOTE_V3, PROMPT_V3, PROMPT_V3_FIND_SOURCE } from './prompts/v3.ts';

export interface TutorPrompt {
  /** Frozen, because the prompt cache is a prefix match, so student and turn details go in a note. */
  system: string;
  /** Sent with every student message, where it holds the model better than a rule far back in the prompt. */
  turnNote: Record<string, string> | null;
  /** Sent only on a lesson's opening turns, and only with a memory note saying what they showed or found hard. */
  fitNote?: Record<string, string>;
}

export const PROMPT_VERSIONS = {
  v1: { system: PROMPT_V1, turnNote: null },
  v2: { system: PROMPT_V2, turnNote: TURN_NOTE_V2 },
  v3: { system: PROMPT_V3, turnNote: TURN_NOTE_V2, fitNote: FIT_NOTE_V3 },
  v3FindSource: { system: PROMPT_V3_FIND_SOURCE, turnNote: TURN_NOTE_V2, fitNote: FIT_NOTE_V3 },
} as const satisfies Record<string, TutorPrompt>;

export type PromptVersion = keyof typeof PROMPT_VERSIONS;

export const CURRENT_PROMPT: PromptVersion = 'v3';

export const TUTOR_PROMPT: TutorPrompt = PROMPT_VERSIONS[CURRENT_PROMPT];

export const TUTOR_SYSTEM = TUTOR_PROMPT.system;
