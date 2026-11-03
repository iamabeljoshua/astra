import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { CurrentAuthUserId, CurrentStudentId, SignedInRoute } from '../auth/route-access';
import { SaveStudentProfileBodyDto, StudentProfileResponseDto } from './student-profile.dto';
import { AccountResponseDto, AnswerBirthDateBodyDto } from './student.dto';
import { StudentsService } from './students.service';

@Controller('me')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  /** Reads the signed-in account, with its student once it has one. */
  @SignedInRoute()
  @Get()
  getAccount(@CurrentAuthUserId() authUserId: string): Promise<AccountResponseDto> {
    return this.studentsService.getAccount(authUserId);
  }

  /** Answers the date of birth question. The first answer stands, and later ones change nothing. */
  @SignedInRoute()
  @Post('birth-date')
  @HttpCode(HttpStatus.OK)
  answerBirthDate(
    @CurrentAuthUserId() authUserId: string,
    @Body() body: AnswerBirthDateBodyDto,
  ): Promise<AccountResponseDto> {
    return this.studentsService.answerBirthDate(authUserId, body.birthDate);
  }

  /** Saves the signed-in student's profile, replacing any earlier one. */
  @Put('profile')
  saveProfile(
    @CurrentStudentId() studentId: string,
    @Body() body: SaveStudentProfileBodyDto,
  ): Promise<StudentProfileResponseDto> {
    return this.studentsService.saveProfile(studentId, body);
  }
}
