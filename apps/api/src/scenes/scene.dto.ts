import { IsIn, IsString, Matches } from 'class-validator';

export const SCENE_THEMES = ['light', 'dark'] as const;
export type SceneTheme = (typeof SCENE_THEMES)[number];

const SCENE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

export class SceneTakeParamsDto {
  /** The stored scene. */
  @IsString()
  @Matches(SCENE_ID)
  sceneId!: string;

  /** The take is drawn once per theme. */
  @IsIn(SCENE_THEMES)
  theme!: SceneTheme;
}

export class SceneLessonResponseDto {
  /** The LiveKit address that the browser connects to. */
  url!: string;

  /** Lets this student join this lesson's room. */
  token!: string;
}
