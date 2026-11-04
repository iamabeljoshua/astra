import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { CurrentSignIn, CurrentStudentId, SignedInRoute } from '../auth/route-access';
import type { SignIn } from '../auth/route-access';
import { SaveStudentProfileBodyDto } from './student-profile.dto';
import { AccountResponseDto, AnswerBirthDateBodyDto, DeletedAccountResponseDto } from './student.dto';
import { StudentsService } from './students.service';

@Controller('me')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  /** Reads the signed-in account, with its student once it has one. */
  @SignedInRoute()
  @Get()
  getAccount(@CurrentSignIn() signIn: SignIn): Promise<AccountResponseDto> {
    return this.studentsService.getAccount(signIn);
  }

  /** Deletes everything the app holds for the signed-in student, including their sign-in. Pressing it again after a failure finishes the job. */
  @SignedInRoute()
  @Delete()
  @HttpCode(HttpStatus.OK)
  deleteAccount(@CurrentSignIn() signIn: SignIn): Promise<DeletedAccountResponseDto> {
    return this.studentsService.deleteAccount(signIn);
  }

  /** Answers the date of birth question. The first answer stands, and later ones change nothing. */
  @SignedInRoute()
  @Post('birth-date')
  @HttpCode(HttpStatus.OK)
  answerBirthDate(
    @CurrentSignIn() signIn: SignIn,
    @Body() body: AnswerBirthDateBodyDto,
  ): Promise<AccountResponseDto> {
    return this.studentsService.answerBirthDate(signIn, body);
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
