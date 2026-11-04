import { Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
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

  private async getStudentId(sessionId: string): Promise<string> {
    const studentId = isUUID(sessionId) ? await this.sessions.findStudentIdOfSession(sessionId) : null;
    if (!studentId) throw new NotFoundException('That session was not found.');
    return studentId;
  }
}
