import { Controller, Delete, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { CurrentStudentId } from '../auth/route-access';
import { LearnerNoteParamsDto, LearnerRecordDto } from './learner-record.dto';
import { LearnerRecordService } from './learner-record.service';

@Controller('me/record')
export class LearnerRecordController {
  constructor(private readonly learnerRecord: LearnerRecordService) {}

  /** Reads everything the tutor remembers about the signed-in student. */
  @Get()
  getRecord(@CurrentStudentId() studentId: string): Promise<LearnerRecordDto> {
    return this.learnerRecord.getRecord(studentId);
  }

  /** Deletes one note. The tutor forgets it, and running that session's update again does not bring it back. */
  @Delete('notes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteNote(@CurrentStudentId() studentId: string, @Param() { id }: LearnerNoteParamsDto): Promise<void> {
    return this.learnerRecord.deleteNote(studentId, id);
  }

  /** Deletes every note about the signed-in student. */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAll(@CurrentStudentId() studentId: string): Promise<void> {
    return this.learnerRecord.deleteAll(studentId);
  }
}
