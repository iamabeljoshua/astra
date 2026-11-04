import { Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { SafetyFlagEntity } from '../infrastructure/orm/entities/safety-flag.entity';
import { SafetyFlagRepository } from '../infrastructure/orm/repositories/safety-flag.repository';
import { SessionsService } from '../sessions/sessions.service';
import type { AddSafetyFlagBodyDto, SafetyFlagResponseDto } from './safety.dto';

function toFlagResponse({ id, studentId, sessionId, kind, source, createdAt, reviewedAt, reviewedBy }: SafetyFlagEntity): SafetyFlagResponseDto {
  return { id, studentId, sessionId, kind, source, createdAt, reviewedAt, reviewedBy };
}

@Injectable()
export class SafetyService {
  constructor(
    private readonly sessions: SessionsService,
    private readonly flags: SafetyFlagRepository,
  ) {}

  async addFlag(sessionId: string, { kind, source }: AddSafetyFlagBodyDto): Promise<void> {
    const studentId = isUUID(sessionId) ? await this.sessions.findStudentIdOfSession(sessionId) : null;
    if (!studentId) throw new NotFoundException('That session was not found.');
    await this.flags.addFlag({ studentId, sessionId, kind, source });
  }

  async listFlags(): Promise<SafetyFlagResponseDto[]> {
    return (await this.flags.listNewestFirstUnreviewedFirst()).map(toFlagResponse);
  }

  async markReviewed({ flagId, reviewerId }: { flagId: string; reviewerId: string }): Promise<SafetyFlagResponseDto> {
    const flag = isUUID(flagId) ? await this.flags.markReviewed({ flagId, reviewerId }) : null;
    if (!flag) throw new NotFoundException('That flag was not found.');
    return toFlagResponse(flag);
  }
}
