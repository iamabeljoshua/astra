import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { SaveStudentProfileBodyDto, StudentProfileResponseDto } from './student-profile.dto';
import { CreateStudentBodyDto, StudentResponseDto, StudentRouteParamsDto } from './student.dto';
import { StudentsService } from './students.service';

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  /** Creates a student with no profile. */
  @Post()
  createStudent(@Body() body: CreateStudentBodyDto): Promise<StudentResponseDto> {
    return this.studentsService.createStudent(body);
  }

  /** Reads one student and their profile. */
  @Get(':studentId')
  getStudent(@Param() routeParams: StudentRouteParamsDto): Promise<StudentResponseDto> {
    return this.studentsService.getStudent(routeParams.studentId);
  }

  /** Saves a student's profile, replacing any earlier one. */
  @Put(':studentId/profile')
  saveProfile(
    @Param() routeParams: StudentRouteParamsDto,
    @Body() body: SaveStudentProfileBodyDto,
  ): Promise<StudentProfileResponseDto> {
    return this.studentsService.saveProfile(routeParams.studentId, body);
  }
}
