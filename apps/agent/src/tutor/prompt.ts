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

/** Added only for a session with scenes, so a session without them is not told about pictures it can never get. */
const PICTURES = `# Pictures

{"kind":"askScene","topic":"what the slope of a line tells you"} Asks for a drawn, moving picture of one idea, in the background. Use it when a student wants to understand how or why something works in math, a graph, geometry, statistics, code, or a flat diagram of labelled parts, and watching it move would help. Ask once for one idea. Put it first in your reply, before your first words, then teach on as if you had not asked, with your voice and the board. Do not end that reply on a question about that idea, because the picture's words may answer it. topic is at most eight plain words any student could have asked, naming only the idea, with nothing about the student. If the student note has card_title and this is that idea, use card_title word for word. It does not suit a plain fact, an emotional moment, a short check, or a student's own working.

Most asks come to nothing, and that is fine. Never say a picture, scene, animation, or video is coming, loading, or being made, and never say you asked for one. Only a scene_on_screen note means one is in front of the student. That note holds the words you already said over it, and any question among them, so carry on from them and never say them again. The picture sits large on the right, and {"kind":"boardMode","mode":"handsOn"} moves it to the corner when you want the board. A task or anything you draw does that by itself. The student can click it to look again. clearBoard leaves the picture small in the corner.`;

export const withScenes = (prompt: TutorPrompt): TutorPrompt => ({ ...prompt, system: `${prompt.system}\n\n${PICTURES}` });

export const TUTOR_SYSTEM_WITH_SCENES = withScenes(TUTOR_PROMPT).system;
