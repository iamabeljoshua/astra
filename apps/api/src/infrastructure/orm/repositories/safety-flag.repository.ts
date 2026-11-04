import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import type { Repository } from 'typeorm';
import { SafetyFlagEntity } from '../entities/safety-flag.entity';

type NewSafetyFlag = Pick<SafetyFlagEntity, 'studentId' | 'sessionId' | 'kind' | 'source'>;

const REVIEWED_LAST = 'flag.reviewedAt IS NOT NULL';

@Injectable()
export class SafetyFlagRepository {
  private readonly flags: Repository<SafetyFlagEntity>;

  constructor(@InjectDataSource() dataSource: DataSource) {
    this.flags = dataSource.getRepository(SafetyFlagEntity);
  }

  async addFlag(flag: NewSafetyFlag): Promise<void> {
    await this.flags.insert(flag);
  }

  listNewestFirstUnreviewedFirst(): Promise<SafetyFlagEntity[]> {
    return this.flags
      .createQueryBuilder('flag')
      .orderBy(REVIEWED_LAST, 'ASC')
      .addOrderBy('flag.createdAt', 'DESC')
      .getMany();
  }

  // The first person to review a flag stays on the record, so a second click changes nothing.
  async markReviewed({ flagId, reviewerId }: { flagId: string; reviewerId: string }): Promise<SafetyFlagEntity | null> {
    await this.flags.update({ id: flagId, reviewedAt: IsNull() }, { reviewedAt: new Date(), reviewedBy: reviewerId });
    return this.flags.findOneBy({ id: flagId });
  }
}
