import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { CurrentAuthUserId, CurrentStudentId, SignedInRoute } from '../auth/route-access';
import { SaveStudentProfileBodyDto } from './student-profile.dto';
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
    return this.studentsService.answerBirthDate(authUserId, body);
  }

  /** Saves the signed-in student's name and profile, replacing any earlier ones. */
  @Put('profile')
  saveProfile(
    @CurrentStudentId() studentId: string,
    @Body() body: SaveStudentProfileBodyDto,
  ): Promise<AccountResponseDto> {
    return this.studentsService.saveProfile(studentId, body);
  }
}
