import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { StudentGoal, StudentLevel, TutorVoice } from '../../../students/student-profile-options';
import { StudentEntity } from './student.entity';

@Entity('student_profiles')
export class StudentProfileEntity {
  @PrimaryColumn('uuid', { name: 'student_id' })
  studentId!: string;

  @OneToOne(() => StudentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: StudentEntity;

  @Column('text', { array: true })
  interests!: string[];

  @Column('text')
  level!: StudentLevel;

  @Column('text')
  goal!: StudentGoal;

  @Column('text')
  voice!: TutorVoice;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
