import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { StudentsModule } from '../students/students.module';
import { TutorSpendModule } from '../tutor-spend/tutor-spend.module';
import { AgentChannelController } from './agent-channel.controller';
import { AgentChannelService } from './agent-channel.service';

@Module({
  imports: [SessionsModule, StudentsModule, TutorSpendModule],
  controllers: [AgentChannelController],
  providers: [AgentChannelService],
})
export class AgentChannelModule {}
