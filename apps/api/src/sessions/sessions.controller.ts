import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentStudentId } from '../auth/route-access';
import {
  CreateSessionBodyDto,
  ListSessionsQueryDto,
  SessionParamsDto,
  SessionReplayResponseDto,
  SessionResponseDto,
  UpdateSessionBodyDto,
} from './session.dto';
import { SessionsService } from './sessions.service';

const DEFAULT_SESSIONS_PER_LIST = 50;
const NO_CONTENT_STATUS = 204;

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /** Starts a session for the signed-in student. */
  @Post()
  createSession(
    @CurrentStudentId() studentId: string,
    @Body() body: CreateSessionBodyDto,
  ): Promise<SessionResponseDto> {
    return this.sessionsService.createSession(studentId, body);
  }

  /** Lists the signed-in student's sessions, newest first, or those that match a search. */
  @Get()
  listSessions(
    @CurrentStudentId() studentId: string,
    @Query() { limit = DEFAULT_SESSIONS_PER_LIST, offset = 0, search }: ListSessionsQueryDto,
  ): Promise<SessionResponseDto[]> {
    return this.sessionsService.listSessions(studentId, { limit, offset, search });
  }

  /** Gets one of the signed-in student's sessions. Another student's session answers 404. */
  @Get(':id')
  getSession(
    @CurrentStudentId() studentId: string,
    @Param() { id }: SessionParamsDto,
  ): Promise<SessionResponseDto> {
    return this.sessionsService.getSession(studentId, id);
  }

  /** Gets what the signed-in student's session kept, to play it again. Another student's session answers 404. */
  @Get(':id/replay')
  getReplay(
    @CurrentStudentId() studentId: string,
    @Param() { id }: SessionParamsDto,
  ): Promise<SessionReplayResponseDto> {
    return this.sessionsService.getReplay(studentId, id);
  }

  /** Deletes what a session kept to replay, leaving its title and length in the list. Another student's session answers 404. */
  @Delete(':id/replay')
  @HttpCode(NO_CONTENT_STATUS)
  deleteReplay(
    @CurrentStudentId() studentId: string,
    @Param() { id }: SessionParamsDto,
  ): Promise<void> {
    return this.sessionsService.deleteReplay(studentId, id);
  }

  /** Saves a session's length and can end it. Another student's session answers 404. */
  @Patch(':id')
  updateSession(
    @CurrentStudentId() studentId: string,
    @Param() { id }: SessionParamsDto,
    @Body() body: UpdateSessionBodyDto,
  ): Promise<SessionResponseDto> {
    return this.sessionsService.updateSession(studentId, id, body);
  }
}
