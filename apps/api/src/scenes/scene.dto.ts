import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

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

export class KitTakeTimingDto {
  /** Each named moment of the scene, in seconds. */
  moments!: Record<string, number>;

  /** The scene's length in seconds. */
  duration!: number;
}

export class KitTakeDto {
  /** The scene's code, which runs only inside the page's sandbox. */
  code!: string;

  /** The same times as the scene's 2D take, so both run on one clock. */
  timing!: KitTakeTimingDto;
}

export class LibrarySceneParamsDto {
  /** The stored scene. */
  @IsString()
  @Matches(SCENE_ID)
  sceneId!: string;
}

export class LibrarySampleQueryDto {
  /** The same number draws the same sample. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  seed?: number;
}

export class LibrarySceneDto {
  /** The stored scene. */
  sceneId!: string;

  /** The title on the server's own list. */
  title!: string;

  /** An opening scene for a Home topic, or one of the deeper scenes on it. */
  kind!: 'opening' | 'deeper';

  /** The subject of the Home topic it belongs to. */
  subject!: string;

  /** What the tutor says over the scene, with its moment marks. */
  narration!: string;

  /** The question the tutor asks after it. */
  close!: string;

  /** A reviewer flagged it, so no student sees it until someone has looked at it. */
  isFlagged!: boolean;

  /** Always false for now, because no person has checked a library scene. */
  isCheckedByPerson!: boolean;
}

export class SceneLessonResponseDto {
  /** The LiveKit address that the browser connects to. */
  url!: string;

  /** Lets this student join this lesson's room. */
  token!: string;
}
