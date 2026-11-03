import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentsService } from '../students/students.service';
import type { CreateSessionBodyDto, SessionResponseDto } from './session.dto';
import { SessionEntity } from './session.entity';

function toSessionResponse(session: SessionEntity): SessionResponseDto {
  return {
    id: session.id,
    title: session.title,
    subject: session.subject,
    language: session.language,
    status: session.status,
    startedAt: session.startedAt,
    durationSeconds: session.durationSeconds,
    detail: session.detail,
    artwork: session.artwork,
  };
}

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(SessionEntity) private readonly sessions: Repository<SessionEntity>,
    private readonly studentsService: StudentsService,
  ) {}

  async createSession(studentId: string, body: CreateSessionBodyDto): Promise<SessionResponseDto> {
    await this.studentsService.requireStudent(studentId);
    const { id } = await this.sessions.save(this.sessions.create({ studentId, ...body }));
    return toSessionResponse(await this.sessions.findOneByOrFail({ id }));
  }

  async listSessions(studentId: string, limit: number): Promise<SessionResponseDto[]> {
    await this.studentsService.requireStudent(studentId);
    const sessions = await this.sessions.find({
      where: { studentId },
      order: { startedAt: 'DESC', id: 'DESC' },
      take: limit,
    });
    return sessions.map(toSessionResponse);
  }
}
