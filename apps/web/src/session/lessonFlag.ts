export const isLessonEnabled = () => import.meta.env.VITE_SCENE_LESSONS === '1';

// A build reads this once, so a build without it never asks about a graphics card or fetches an engine.
export const isTutorSceneEnabled = () => import.meta.env.VITE_TUTOR_SCENES === '1';

export const hasScenes = () => isLessonEnabled() || isTutorSceneEnabled();
