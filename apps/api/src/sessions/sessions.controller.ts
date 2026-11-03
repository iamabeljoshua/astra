import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentStudentId } from '../auth/route-access';
import { CreateSessionBodyDto, ListSessionsQueryDto, SessionResponseDto } from './session.dto';
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

  /** Lists the signed-in student's sessions, newest first. */
  @Get()
  listSessions(
    @CurrentStudentId() studentId: string,
    @Query() query: ListSessionsQueryDto,
  ): Promise<SessionResponseDto[]> {
    return this.sessionsService.listSessions(studentId, query.limit ?? DEFAULT_SESSIONS_PER_LIST);
  }
}
