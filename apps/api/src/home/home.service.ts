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
    const student = await this.studentsService.requireStudent(studentId);
    return {
      studentName: student.name,
      continueSession: await this.sessionsService.getNewestUnfinishedSession(studentId),
      picks: SEEDED_PICKS,
    };
  }
}
