import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { StudentRouteParamsDto } from '../students/student.dto';
import { CreateSessionBodyDto, ListSessionsQueryDto, SessionResponseDto } from './session.dto';
import { SessionsService } from './sessions.service';

@Controller('students/:studentId/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /** Starts a session for a student. */
  @Post()
  createSession(
    @Param() routeParams: StudentRouteParamsDto,
    @Body() body: CreateSessionBodyDto,
  ): Promise<SessionResponseDto> {
    return this.sessionsService.createSession(routeParams.studentId, body);
  }

  /** Lists a student's sessions, newest first. */
  @Get()
  listSessions(
    @Param() routeParams: StudentRouteParamsDto,
    @Query() query: ListSessionsQueryDto,
  ): Promise<SessionResponseDto[]> {
    return this.sessionsService.listSessions(routeParams.studentId, query.limit);
  }
}
