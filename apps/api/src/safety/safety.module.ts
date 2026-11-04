import { Module } from '@nestjs/common';
import { RepositoryModule } from '../infrastructure/orm/repositories/repository.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ReviewController } from './review.controller';
import { SafetyAgentController } from './safety-agent.controller';
import { SafetyService } from './safety.service';

@Module({
  imports: [RepositoryModule, SessionsModule],
  controllers: [SafetyAgentController, ReviewController],
  providers: [SafetyService],
})
export class SafetyModule {}
