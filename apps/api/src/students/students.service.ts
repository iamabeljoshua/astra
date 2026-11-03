import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { SaveStudentProfileBodyDto, StudentProfileResponseDto } from './student-profile.dto';
import { StudentProfileEntity } from './student-profile.entity';
import type { CreateStudentBodyDto, StudentResponseDto } from './student.dto';
import { StudentEntity } from './student.entity';

function toProfileResponse(profile: StudentProfileEntity): StudentProfileResponseDto {
  return {
    interests: profile.interests,
    level: profile.level,
    goal: profile.goal,
    voice: profile.voice,
  };
}

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(StudentEntity) private readonly students: Repository<StudentEntity>,
    @InjectRepository(StudentProfileEntity)
    private readonly profiles: Repository<StudentProfileEntity>,
  ) {}

  async createStudent(body: CreateStudentBodyDto): Promise<StudentResponseDto> {
    const student = await this.students.save(this.students.create({ name: body.name }));
    return { id: student.id, name: student.name, profile: null };
  }

  async getStudent(studentId: string): Promise<StudentResponseDto> {
    const student = await this.requireStudent(studentId);
    const profile = await this.profiles.findOneBy({ studentId });
    return {
      id: student.id,
      name: student.name,
      profile: profile && toProfileResponse(profile),
    };
  }

  async saveProfile(
    studentId: string,
    body: SaveStudentProfileBodyDto,
  ): Promise<StudentProfileResponseDto> {
    await this.requireStudent(studentId);
    await this.profiles.upsert({ studentId, ...body }, ['studentId']);
    return toProfileResponse(await this.profiles.findOneByOrFail({ studentId }));
  }

  async requireStudent(studentId: string): Promise<StudentEntity> {
    const student = await this.students.findOneBy({ id: studentId });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }
}
