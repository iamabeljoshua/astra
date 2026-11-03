import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { HomeModule } from './home/home.module';
import { RequestValidationModule } from './request-validation.module';
import { SessionsModule } from './sessions/sessions.module';
import { StudentsModule } from './students/students.module';

@Module({
  imports: [RequestValidationModule, DatabaseModule, StudentsModule, SessionsModule, HomeModule],
  controllers: [HealthController],
})
export class AppModule {}
