import { Module } from '@nestjs/common';
import { AgentChannelModule } from './agent-channel/agent-channel.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './infrastructure/orm/database.module';
import { HealthController } from './health/health.controller';
import { HomeModule } from './home/home.module';
import { LiveRoomModule } from './livekit/live-room.module';
import { RequestValidationModule } from './request-validation.module';
import { SessionsModule } from './sessions/sessions.module';
import { StudentsModule } from './students/students.module';

@Module({
  imports: [RequestValidationModule, DatabaseModule, AuthModule, StudentsModule, SessionsModule, HomeModule, LiveRoomModule, AgentChannelModule],
  controllers: [HealthController],
})
export class AppModule {}
