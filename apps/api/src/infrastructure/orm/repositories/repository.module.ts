import { Module } from '@nestjs/common';
import { SafetyFlagRepository } from './safety-flag.repository';
import { SessionRepository } from './session.repository';
import { StudentRepository } from './student.repository';
import { StudentSpendRepository } from './student-spend.repository';

const REPOSITORIES = [StudentRepository, SessionRepository, StudentSpendRepository, SafetyFlagRepository];

@Module({
  providers: REPOSITORIES,
  exports: REPOSITORIES,
})
export class RepositoryModule {}
