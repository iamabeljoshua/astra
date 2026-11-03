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
    const isNewStudent = !(await this.sessionsService.hasStartedASession(studentId));
    const profile = await this.studentsService.getProfile(studentId);
    return {
      studentName: await this.studentsService.getStudentName(studentId),
      isNewStudent,
      startHereQuestion: isNewStudent ? (profile?.firstQuestion ?? null) : null,
      continueSession: await this.sessionsService.getNewestUnfinishedSession(studentId),
      picks: getPicksForStudent(profile, LIBRARY),
    };
  }
}
