import { Module } from '@nestjs/common';
import { LearnerRecordRepository } from './learner-record.repository';
import { SessionRepository } from './session.repository';
import { StudentRepository } from './student.repository';
import { StudentSpendRepository } from './student-spend.repository';

const REPOSITORIES = [StudentRepository, SessionRepository, StudentSpendRepository, LearnerRecordRepository];

@Module({
  providers: REPOSITORIES,
  exports: REPOSITORIES,
})
export class RepositoryModule {}
