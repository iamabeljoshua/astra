import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConsentModule } from './consent/consent.module';
import { DatabaseModule } from './infrastructure/orm/database.module';
import { HealthController } from './health/health.controller';
import { HomeModule } from './home/home.module';
import { RequestValidationModule } from './request-validation.module';
import { SessionsModule } from './sessions/sessions.module';
import { StudentsModule } from './students/students.module';

@Module({
  imports: [RequestValidationModule, DatabaseModule, AuthModule, StudentsModule, ConsentModule, SessionsModule, HomeModule],
  controllers: [HealthController],
})
export class AppModule {}
