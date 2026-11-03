import { Module } from '@nestjs/common';
import { SessionRepository } from './session.repository';
import { StudentRepository } from './student.repository';

const REPOSITORIES = [StudentRepository, SessionRepository];

@Module({
  providers: REPOSITORIES,
  exports: REPOSITORIES,
})
export class RepositoryModule {}
