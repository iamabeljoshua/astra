import { Module } from '@nestjs/common';
import { LearnerRecordModule } from '../learner-record/learner-record.module';
import { SessionsModule } from '../sessions/sessions.module';
import { StudentsModule } from '../students/students.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [StudentsModule, SessionsModule, LearnerRecordModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
