export const isLessonEnabled = () => import.meta.env.VITE_SCENE_LESSONS === '1';

export const isTutorSceneEnabled = () => import.meta.env.VITE_TUTOR_SCENES === '1';

export const hasScenes = () => isLessonEnabled() || isTutorSceneEnabled();
