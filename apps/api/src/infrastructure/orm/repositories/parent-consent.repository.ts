import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { ParentConsentRequestEntity } from '../entities/parent-consent-request.entity';
import { StudentEntity } from '../entities/student.entity';
import { HOLD_ACCOUNT_UNTIL_COMMIT } from './student.repository';

interface ConsentRequestFields {
  studentId: string;
  parentEmail: string;
  linkTokenHash: string;
}

export interface ConsentLinkRecord {
  studentName: string | null;
  parentConsentAt: Date | null;
}

async function readLinkRecord(manager: EntityManager, linkTokenHash: string): Promise<ConsentLinkRecord | null> {
  const request = await manager.findOne(ParentConsentRequestEntity, { where: { linkTokenHash }, relations: { student: true } });
  return request?.student ? { studentName: request.student.name, parentConsentAt: request.student.parentConsentAt } : null;
}

@Injectable()
export class ParentConsentRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  saveRequest(fields: ConsentRequestFields): Promise<{ isNewLink: boolean }> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(HOLD_ACCOUNT_UNTIL_COMMIT, [fields.studentId]);
      const earlier = await manager.findOneBy(ParentConsentRequestEntity, { studentId: fields.studentId });
      if (earlier?.parentEmail === fields.parentEmail) return { isNewLink: false };
      await manager.upsert(ParentConsentRequestEntity, fields, ['studentId']);
      return { isNewLink: true };
    });
  }

  findLinkRecord(linkTokenHash: string): Promise<ConsentLinkRecord | null> {
    return readLinkRecord(this.dataSource.manager, linkTokenHash);
  }

  accept(linkTokenHash: string): Promise<ConsentLinkRecord | null> {
    return this.dataSource.transaction(async (manager) => {
      const request = await manager.findOneBy(ParentConsentRequestEntity, { linkTokenHash });
      if (!request) return null;
      await manager.query(HOLD_ACCOUNT_UNTIL_COMMIT, [request.studentId]);
      await manager.update(StudentEntity, { id: request.studentId, parentConsentAt: IsNull() }, { parentConsentAt: new Date() });
      return readLinkRecord(manager, linkTokenHash);
    });
  }
}
