import { createReadStream, existsSync } from 'node:fs';
import { Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Put, Query, Res, ServiceUnavailableException, StreamableFile } from '@nestjs/common';
import { CurrentStudentId } from '../auth/route-access';
import { getLibraryScenes, getLightSheetPath, getWeightedSample, isNamedReviewer, setSceneFlag } from './scene-library';
import { LibrarySampleQueryDto, LibrarySceneDto, LibrarySceneParamsDto } from './scene.dto';

const NO_CONTENT = 204;

interface HeaderSetter {
  setHeader(name: string, value: string): void;
}

function getReviewerStore(studentId: string): string {
  if (!isNamedReviewer(studentId)) throw new ForbiddenException('This page is for named reviewers.');
  const storeRoot = process.env.SCENE_STORE_DIR;
  if (!storeRoot) throw new ServiceUnavailableException('Scenes are not set up.');
  return storeRoot;
}

function requireLibraryScene(storeRoot: string, sceneId: string): void {
  if (!getLibraryScenes(storeRoot).some((scene) => scene.sceneId === sceneId)) throw new NotFoundException('This scene is not in the library.');
}

@Controller('scene-library')
export class SceneLibraryController {
  /** A sample of the library for a named reviewer, weighted to opening scenes. Anyone else gets 403. */
  @Get('sample')
  getSample(@CurrentStudentId() studentId: string, @Query() { seed = 0 }: LibrarySampleQueryDto): LibrarySceneDto[] {
    return getWeightedSample(getLibraryScenes(getReviewerStore(studentId)), seed);
  }

  /** The frames a scene's review saw, in the light theme, for a named reviewer. Anyone else gets 403. */
  @Get(':sceneId/sheet')
  getSheet(@CurrentStudentId() studentId: string, @Param() { sceneId }: LibrarySceneParamsDto, @Res({ passthrough: true }) response: HeaderSetter): StreamableFile {
    const storeRoot = getReviewerStore(studentId);
    requireLibraryScene(storeRoot, sceneId);
    const path = getLightSheetPath(storeRoot, sceneId);
    if (!existsSync(path)) throw new NotFoundException('This scene has no frames.');
    response.setHeader('Content-Type', 'image/png');
    return new StreamableFile(createReadStream(path));
  }

  /** Flags a scene, so no student sees it until someone has looked at it. Anyone but a named reviewer gets 403. */
  @Put(':sceneId/flag')
  @HttpCode(NO_CONTENT)
  flagScene(@CurrentStudentId() studentId: string, @Param() { sceneId }: LibrarySceneParamsDto): void {
    const storeRoot = getReviewerStore(studentId);
    requireLibraryScene(storeRoot, sceneId);
    setSceneFlag({ storeRoot, sceneId, flaggedBy: studentId, isFlagged: true });
  }

  /** Someone has looked at a flagged scene, and it may show again. Anyone but a named reviewer gets 403. */
  @Delete(':sceneId/flag')
  @HttpCode(NO_CONTENT)
  clearFlag(@CurrentStudentId() studentId: string, @Param() { sceneId }: LibrarySceneParamsDto): void {
    const storeRoot = getReviewerStore(studentId);
    requireLibraryScene(storeRoot, sceneId);
    setSceneFlag({ storeRoot, sceneId, flaggedBy: studentId, isFlagged: false });
  }
}
