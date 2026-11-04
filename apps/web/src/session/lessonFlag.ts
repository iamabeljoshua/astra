/** Off unless a build asks for it, because the live room and the tutor's brain are still landing. */
export const isLessonEnabled = () => import.meta.env.VITE_SCENE_LESSONS === '1';
