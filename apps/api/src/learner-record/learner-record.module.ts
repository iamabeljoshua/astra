import { Module } from '@nestjs/common';
import { RepositoryModule } from '../infrastructure/orm/repositories/repository.module';
import { LearnerRecordController } from './learner-record.controller';
import { LearnerRecordService } from './learner-record.service';

@Module({
  imports: [RepositoryModule],
  controllers: [LearnerRecordController],
  providers: [LearnerRecordService],
  exports: [LearnerRecordService],
})
export class LearnerRecordModule {}
