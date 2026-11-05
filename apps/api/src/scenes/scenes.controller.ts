import { createReadStream } from 'node:fs';
import { Controller, Get, HttpCode, NotFoundException, Param, Post, Res, StreamableFile } from '@nestjs/common';
import { CurrentStudentId } from '../auth/route-access';
import { SessionParamsDto } from '../sessions/session.dto';
import { KitTakeDto, LibrarySceneParamsDto, SceneLessonResponseDto, SceneTakeParamsDto } from './scene.dto';
import { findCheckedKitTake, findCheckedTake } from './scene-takes';
import { ScenesService } from './scenes.service';

const OK_STATUS = 200;

interface HeaderSetter {
  setHeader(name: string, value: string): void;
}

@Controller()
export class ScenesController {
  constructor(private readonly scenesService: ScenesService) {}

  /** Sends a checked scene's 3D take, for the page's sandbox. A topic with a reviewed kit scene has one beside its 2D take, under the same rules for who may see it. */
  @Get('scene-takes/:sceneId/kit')
  getKitTake(@CurrentStudentId() studentId: string, @Param() { sceneId }: LibrarySceneParamsDto): KitTakeDto {
    const take = findCheckedKitTake({ storeRoot: process.env.SCENE_STORE_DIR, sceneId, studentId });
    if (!take) throw new NotFoundException('This scene has no 3D take.');
    return take;
  }

  /** Sends one stored take of a checked scene. A scene from a library card goes to any student. A scene from a typed question goes only to the student who asked, and any other student gets 404. A take never changes, so the browser keeps it. */
  @Get('scene-takes/:sceneId/:theme')
  getSceneTake(@CurrentStudentId() studentId: string, @Param() { sceneId, theme }: SceneTakeParamsDto, @Res({ passthrough: true }) response: HeaderSetter): StreamableFile {
    const path = findCheckedTake({ storeRoot: process.env.SCENE_STORE_DIR, sceneId, theme, studentId });
    if (!path) throw new NotFoundException('This scene has no take.');
    response.setHeader('Content-Encoding', 'br');
    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(createReadStream(path));
  }

  /** Opens the stand-in lesson for the signed-in student's own session, until the live room and the tutor's brain take over. Another student's session answers 404, a finished one 409, and a student past a lesson limit 429, with the reason and the real wait in its body. */
  @Post('sessions/:id/scene-lesson')
  @HttpCode(OK_STATUS)
  openSceneLesson(@CurrentStudentId() studentId: string, @Param() { id }: SessionParamsDto): Promise<SceneLessonResponseDto> {
    return this.scenesService.openLesson(studentId, id);
  }
}
