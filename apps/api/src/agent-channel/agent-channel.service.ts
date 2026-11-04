import { Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { LearnerRecordDto, WriteLearnerNotesBodyDto } from '../learner-record/learner-record.dto';
import { LearnerRecordService } from '../learner-record/learner-record.service';
import { SessionsService } from '../sessions/sessions.service';
import { StudentsService } from '../students/students.service';
import { TutorSpendService } from '../tutor-spend/tutor-spend.service';
import type { SaveLogBodyDto, TutorBrief } from './agent-channel.dto';

const NO_BRIEF: TutorBrief = { level: null, interests: [], goal: null };

@Injectable()
export class AgentChannelService {
  constructor(
    private readonly sessions: SessionsService,
    private readonly students: StudentsService,
    private readonly tutorSpend: TutorSpendService,
    private readonly learnerRecord: LearnerRecordService,
  ) {}

  async getBrief(sessionId: string): Promise<TutorBrief> {
    const profile = await this.students.getProfile(await this.getStudentId(sessionId));
    if (!profile) return NO_BRIEF;
    const { level, interests, goal } = profile;
    return { level, interests, goal };
  }

  async addSpend(sessionId: string, usd: number): Promise<{ isOverDailyLimit: boolean }> {
    return this.tutorSpend.addSpend(await this.getStudentId(sessionId), usd);
  }

  async saveLog(sessionId: string, run: SaveLogBodyDto): Promise<void> {
    await this.getStudentId(sessionId);
    await this.sessions.saveLog(sessionId, run);
  }

  async saveRecap(sessionId: string, recap: object): Promise<void> {
    await this.getStudentId(sessionId);
    await this.sessions.saveRecap(sessionId, recap);
  }

  async setTitle(sessionId: string, title: string): Promise<void> {
    await this.sessions.renameUnfinished(await this.getStudentId(sessionId), sessionId, title);
  }

  async getRecord(sessionId: string): Promise<LearnerRecordDto> {
    return this.learnerRecord.getRecord(await this.getStudentId(sessionId));
  }

  async writeRecord(sessionId: string, { updateKey, notes }: WriteLearnerNotesBodyDto): Promise<{ wasApplied: boolean }> {
    const studentId = await this.getStudentId(sessionId);
    return { wasApplied: await this.learnerRecord.applyUpdate({ studentId, sessionId, updateKey, notes }) };
  }

  private async getStudentId(sessionId: string): Promise<string> {
    const studentId = isUUID(sessionId) ? await this.sessions.findStudentIdOfSession(sessionId) : null;
    if (!studentId) throw new NotFoundException('That session was not found.');
    return studentId;
  }
}
