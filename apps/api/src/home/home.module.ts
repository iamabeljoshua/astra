import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { StudentsModule } from '../students/students.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [StudentsModule, SessionsModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
