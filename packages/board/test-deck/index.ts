import { BIOLOGY_SCENES } from './scenes/biology.ts';
import { CODE_SCENES } from './scenes/code.ts';
import { HISTORY_SCENES } from './scenes/history.ts';
import { HOSTILE_SCENES } from './scenes/hostile.ts';
import { LANGUAGE_SCENES } from './scenes/language.ts';
import { MATH_SCENES } from './scenes/math.ts';
import { MIXED_SCENES } from './scenes/mixed.ts';
import { MUSIC_SCENES } from './scenes/music.ts';
import { PHYSICS_SCENES } from './scenes/physics.ts';
import type { DeckScene } from './deck-scene.ts';

export { type DeckScene, getSceneCommands, getSceneMoments, getSceneOperations, getSceneRestMs, SUBJECTS, type Subject } from './deck-scene.ts';
export { getShownWords } from './shown-words.ts';

export const DECK: readonly DeckScene[] = [...MATH_SCENES, ...PHYSICS_SCENES, ...LANGUAGE_SCENES, ...HISTORY_SCENES, ...BIOLOGY_SCENES, ...CODE_SCENES, ...MUSIC_SCENES, ...MIXED_SCENES, ...HOSTILE_SCENES];
