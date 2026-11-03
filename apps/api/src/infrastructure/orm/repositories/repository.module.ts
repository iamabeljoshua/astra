import { Module } from '@nestjs/common';
import { ParentConsentRepository } from './parent-consent.repository';
import { SessionRepository } from './session.repository';
import { StudentRepository } from './student.repository';

const REPOSITORIES = [StudentRepository, SessionRepository, ParentConsentRepository];

@Module({
  providers: REPOSITORIES,
  exports: REPOSITORIES,
})
export class RepositoryModule {}
