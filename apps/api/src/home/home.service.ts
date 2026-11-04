import { Injectable, Logger } from '@nestjs/common';
import { LearnerRecordService } from '../learner-record/learner-record.service';
import type { LearnerNoteDto } from '../learner-record/learner-record.dto';
import { SessionsService } from '../sessions/sessions.service';
import { StudentsService } from '../students/students.service';
import { getPicksForStudent } from '../picks/getPicksForStudent';
import { LIBRARY } from '../picks/library';
import type { HomeScreenResponseDto } from './home-screen.dto';

@Injectable()
export class HomeService {
  private readonly logger = new Logger(HomeService.name);

  constructor(
    private readonly studentsService: StudentsService,
    private readonly sessionsService: SessionsService,
    private readonly learnerRecordService: LearnerRecordService,
  ) {}

  private async readNotes(studentId: string): Promise<LearnerNoteDto[]> {
    try {
      return (await this.learnerRecordService.getRecord(studentId)).notes;
    } catch {
      this.logger.warn('Home could not read a learner record, so its cards come from sessions and the library.');
      return [];
    }
  }

  async getHomeScreen(studentId: string): Promise<HomeScreenResponseDto> {
    const continueSession = await this.sessionsService.getNewestUnfinishedSession(studentId);
    return {
      studentName: await this.studentsService.getStudentName(studentId),
      isNewStudent: !(await this.sessionsService.hasStartedASession(studentId)),
      continueSession,
      picks: getPicksForStudent(
        {
          fit: await this.studentsService.getProfile(studentId),
          history: await this.sessionsService.getHistoryForPicks(studentId),
          continueCardSessionId: continueSession?.id ?? null,
          notes: await this.readNotes(studentId),
          now: new Date(),
        },
        LIBRARY,
      ),
    };
  }
}
