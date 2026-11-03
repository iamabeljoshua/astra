import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentStudentId } from '../auth/route-access';
import {
  CreateSessionBodyDto,
  ListSessionsQueryDto,
  SessionParamsDto,
  SessionResponseDto,
  UpdateSessionBodyDto,
} from './session.dto';
import { SessionsService } from './sessions.service';

const DEFAULT_SESSIONS_PER_LIST = 50;

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
