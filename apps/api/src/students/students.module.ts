import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClosedAccountEntity } from './closed-account.entity';
import { StudentProfileEntity } from './student-profile.entity';
import { StudentEntity } from './student.entity';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [TypeOrmModule.forFeature([StudentEntity, StudentProfileEntity, ClosedAccountEntity])],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
