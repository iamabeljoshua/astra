import { Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { SessionsService } from '../sessions/sessions.service';
import { StudentsService } from '../students/students.service';
import { TutorSpendService } from '../tutor-spend/tutor-spend.service';
import type { TutorBrief } from './agent-channel.dto';


@Injectable()
export class AgentChannelService {
  constructor(
    private readonly sessions: SessionsService,
    private readonly students: StudentsService,
    private readonly tutorSpend: TutorSpendService,
  ) {}

  async getBrief(sessionId: string): Promise<TutorBrief> {
    const [profile, cardTitle] = await Promise.all([this.students.getProfile(await this.getStudentId(sessionId)), this.sessions.getCardTitle(sessionId)]);
    return { level: profile?.level ?? null, interests: profile?.interests ?? [], goal: profile?.goal ?? null, cardTitle };
  }

  async addSpend(sessionId: string, usd: number): Promise<{ isOverDailyLimit: boolean }> {
    return this.tutorSpend.addSpend(await this.getStudentId(sessionId), usd);
  }

  async setTitle(sessionId: string, title: string): Promise<void> {
    await this.sessions.renameUnfinished(await this.getStudentId(sessionId), sessionId, title);
  }

  private async getStudentId(sessionId: string): Promise<string> {
    const studentId = isUUID(sessionId) ? await this.sessions.findStudentIdOfSession(sessionId) : null;
    if (!studentId) throw new NotFoundException('That session was not found.');
    return studentId;
  }
}
