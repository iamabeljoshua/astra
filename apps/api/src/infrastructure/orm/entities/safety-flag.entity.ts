import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SAFETY_FLAG_KINDS, SAFETY_FLAG_SOURCES } from '../../../safety/safety-flag-options';
import type { SafetyFlagKind, SafetyFlagSource } from '../../../safety/safety-flag-options';
import { SessionEntity } from './session.entity';
import { StudentEntity } from './student.entity';

@Entity('safety_flags')
@Index(['createdAt'])
export class SafetyFlagEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'student_id' })
  studentId!: string;

  @ManyToOne(() => StudentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: StudentEntity;

  @Column('uuid', { name: 'session_id', nullable: true })
  sessionId!: string | null;

  @ManyToOne(() => SessionEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'session_id' })
  session?: SessionEntity | null;

  @Column({ type: 'enum', enum: SAFETY_FLAG_KINDS, enumName: 'safety_flag_kind' })
  kind!: SafetyFlagKind;

  @Column({ type: 'enum', enum: SAFETY_FLAG_SOURCES, enumName: 'safety_flag_source' })
  source!: SafetyFlagSource;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'reviewed_at', nullable: true })
  reviewedAt!: Date | null;

  @Column('uuid', { name: 'reviewed_by', nullable: true })
  reviewedBy!: string | null;
}
