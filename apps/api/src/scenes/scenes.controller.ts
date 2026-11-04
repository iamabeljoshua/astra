import { createReadStream } from 'node:fs';
import { Controller, Get, HttpCode, NotFoundException, Param, Post, Res, StreamableFile } from '@nestjs/common';
import { CurrentStudentId } from '../auth/route-access';
import { SessionParamsDto } from '../sessions/session.dto';
import { SceneLessonResponseDto, SceneTakeParamsDto } from './scene.dto';
import { findCheckedTake } from './scene-takes';
import { ScenesService } from './scenes.service';

const OK_STATUS = 200;

interface HeaderSetter {
  setHeader(name: string, value: string): void;
}

@Controller()
export class ScenesController {
  constructor(private readonly scenesService: ScenesService) {}

  /** Sends one stored take of a checked scene. A take is shared truth with no student data, and it never changes, so the browser keeps it. */
  @Get('scene-takes/:sceneId/:theme')
  getSceneTake(@Param() { sceneId, theme }: SceneTakeParamsDto, @Res({ passthrough: true }) response: HeaderSetter): StreamableFile {
    const path = findCheckedTake(process.env.SCENE_STORE_DIR, sceneId, theme);
    if (!path) throw new NotFoundException('This scene has no take.');
    response.setHeader('Content-Encoding', 'br');
    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return new StreamableFile(createReadStream(path));
  }

  /** Opens the stand-in lesson for the signed-in student's own session, until the live room and the tutor's brain take over. Another student's session answers 404, and a finished one 409. */
  @Post('sessions/:id/scene-lesson')
  @HttpCode(OK_STATUS)
  openSceneLesson(@CurrentStudentId() studentId: string, @Param() { id }: SessionParamsDto): Promise<SceneLessonResponseDto> {
    return this.scenesService.openLesson(studentId, id);
  }
}
