import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { StudentEntity } from './student.entity';

@Entity('student_daily_spend')
export class StudentDailySpendEntity {
  @PrimaryColumn('uuid', { name: 'student_id' })
  studentId!: string;

  @ManyToOne(() => StudentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: StudentEntity;

  @PrimaryColumn('date', { name: 'spent_on' })
  spentOn!: string;

  /** The driver returns a bigint as text, so no total loses a charge to rounding. */
  @Column('bigint', { name: 'spent_micro_usd' })
  spentMicroUsd!: string;
}
