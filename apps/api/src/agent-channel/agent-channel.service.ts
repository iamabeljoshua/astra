import { Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { LearnerRecordDto, WriteLearnerNotesBodyDto } from '../learner-record/learner-record.dto';
import { LearnerRecordService } from '../learner-record/learner-record.service';
import { getCardMaterial } from '../scenes/scene-library';
import { SessionsService } from '../sessions/sessions.service';
import { StudentsService } from '../students/students.service';
import { type SpendReply, TutorSpendService } from '../tutor-spend/tutor-spend.service';
import type { JobOpening, SaveLogBodyDto, TutorBrief } from './agent-channel.dto';


@Injectable()
export class AgentChannelService {
  constructor(
    private readonly sessions: SessionsService,
    private readonly students: StudentsService,
    private readonly tutorSpend: TutorSpendService,
    private readonly learnerRecord: LearnerRecordService,
  ) {}

  async getBrief(sessionId: string): Promise<TutorBrief> {
    const [profile, cardTitle] = await Promise.all([this.students.getProfile(await this.getStudentId(sessionId)), this.sessions.getCardTitle(sessionId)]);
    const cardMaterial = cardTitle ? getCardMaterial(process.env.SCENE_STORE_DIR, cardTitle) : null;
    return { level: profile?.level ?? null, interests: profile?.interests ?? [], goal: profile?.goal ?? null, cardTitle, ...(cardMaterial ? { cardMaterial } : {}) };
  }

  async getOpening(sessionId: string): Promise<JobOpening> {
    const studentId = await this.getStudentId(sessionId);
    return { studentId, question: await this.sessions.getOpeningQuestion(studentId, sessionId) };
  }

  async addSpend(sessionId: string, usd: number): Promise<SpendReply> {
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
