export const isLessonEnabled = () => import.meta.env.VITE_SCENE_LESSONS === '1';

export const isTutorSceneEnabled = () => import.meta.env.VITE_TUTOR_SCENES === '1';

export const hasScenes = () => isLessonEnabled() || isTutorSceneEnabled();

export const isKitSceneEnabled = () => import.meta.env.VITE_KIT_SCENES === '1';

export const isFastSceneEnabled = () => import.meta.env.VITE_FAST_SCENES === '1';

export const isFreshDrawEnabled = () => import.meta.env.VITE_FRESH_DRAW === '1';
