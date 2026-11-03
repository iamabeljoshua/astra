import { Injectable } from '@nestjs/common';
import { SessionsService } from '../sessions/sessions.service';
import { StudentsService } from '../students/students.service';
import type { HomeScreenResponseDto } from './home-screen.dto';
import { SEEDED_PICKS } from './seeded-picks';

@Injectable()
export class HomeService {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly sessionsService: SessionsService,
  ) {}

  async getHomeScreen(studentId: string): Promise<HomeScreenResponseDto> {
    const isNewStudent = !(await this.sessionsService.hasStartedASession(studentId));
    return {
      studentName: await this.studentsService.getStudentName(studentId),
      isNewStudent,
      startHereQuestion: isNewStudent ? await this.studentsService.getFirstQuestion(studentId) : null,
      continueSession: await this.sessionsService.getNewestUnfinishedSession(studentId),
      picks: SEEDED_PICKS,
    };
  }
}
