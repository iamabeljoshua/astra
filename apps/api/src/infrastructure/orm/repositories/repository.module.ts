import { Module } from '@nestjs/common';
import { SessionLogRepository } from './session-log.repository';
import { SessionRepository } from './session.repository';
import { StudentRepository } from './student.repository';
import { StudentSpendRepository } from './student-spend.repository';

const REPOSITORIES = [StudentRepository, SessionRepository, SessionLogRepository, StudentSpendRepository];

@Module({
  providers: REPOSITORIES,
  exports: REPOSITORIES,
})
export class RepositoryModule {}
