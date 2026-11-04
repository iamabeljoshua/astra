import { PROMPT_V1 } from './prompts/v1.ts';
import { PROMPT_V2, TURN_NOTE_V2 } from './prompts/v2.ts';
import { LEVEL_LINES_V3, OPENING_NOTE_V3, PROMPT_V3, PROMPT_V3_FIND_SOURCE } from './prompts/v3.ts';

export interface TutorPrompt {
  /** Frozen, because the prompt cache is a prefix match, so student and turn details go in a note. */
  system: string;
  /** Sent with every student message, where it holds the model better than a rule far back in the prompt. */
  turnNote: Record<string, string> | null;
  openingNote?: Record<string, string>;
  /** One line a turn for each student level, because that holds the model where the level in the prompt loses to its habit. */
  levelLines?: Readonly<Record<string, string>>;
}

export const PROMPT_VERSIONS = {
  v1: { system: PROMPT_V1, turnNote: null },
  v2: { system: PROMPT_V2, turnNote: TURN_NOTE_V2 },
  v3: { system: PROMPT_V3, turnNote: TURN_NOTE_V2, openingNote: OPENING_NOTE_V3, levelLines: LEVEL_LINES_V3 },
  v3FindSource: { system: PROMPT_V3_FIND_SOURCE, turnNote: TURN_NOTE_V2, openingNote: OPENING_NOTE_V3, levelLines: LEVEL_LINES_V3 },
} as const satisfies Record<string, TutorPrompt>;

export type PromptVersion = keyof typeof PROMPT_VERSIONS;

export const CURRENT_PROMPT: PromptVersion = 'v3';

export const TUTOR_PROMPT: TutorPrompt = PROMPT_VERSIONS[CURRENT_PROMPT];

export const TUTOR_SYSTEM = TUTOR_PROMPT.system;
