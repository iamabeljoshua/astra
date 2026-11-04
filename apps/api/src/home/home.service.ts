import { Injectable } from '@nestjs/common';
import { SessionsService } from '../sessions/sessions.service';
import { StudentsService } from '../students/students.service';
import { getPicksForStudent } from '../picks/getPicksForStudent';
import { LIBRARY } from '../picks/library';
import type { HomeScreenResponseDto } from './home-screen.dto';

@Injectable()
export class HomeService {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly sessionsService: SessionsService,
  ) {}

  async getHomeScreen(studentId: string): Promise<HomeScreenResponseDto> {
    const continueSession = await this.sessionsService.getNewestUnfinishedSession(studentId);
    return {
      studentName: await this.studentsService.getStudentName(studentId),
      continueSession,
      picks: getPicksForStudent(
        {
          fit: await this.studentsService.getProfile(studentId),
          history: await this.sessionsService.getTopicHistory(studentId),
          continueSessionId: continueSession?.id ?? null,
        },
        LIBRARY,
      ),
    };
  }
}
