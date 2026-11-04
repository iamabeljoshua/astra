import { Module } from '@nestjs/common';
import { RepositoryModule } from '../infrastructure/orm/repositories/repository.module';
import { TutorSpendService } from './tutor-spend.service';

@Module({
  imports: [RepositoryModule],
  providers: [TutorSpendService],
  exports: [TutorSpendService],
})
export class TutorSpendModule {}
