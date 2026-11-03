import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ArtworkName } from '../../../artwork';
import { StudentEntity } from './student.entity';
import { SESSION_STATUSES } from '../../../sessions/session-options';
import type { SessionLanguage, SessionStatus } from '../../../sessions/session-options';

@Entity('sessions')
@Index(['studentId', 'startedAt'])
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'student_id' })
  studentId!: string;

  @ManyToOne(() => StudentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: StudentEntity;

  @Column('text')
  title!: string;

  @Column('text')
  subject!: string;

  @Column('text')
  language!: SessionLanguage;

  @Column({
    type: 'enum',
    enum: SESSION_STATUSES,
    enumName: 'session_status',
    default: 'in_progress',
  })
  status!: SessionStatus;

  @Column('timestamptz', { name: 'started_at', default: () => 'now()' })
  startedAt!: Date;

  @Column('integer', { name: 'duration_seconds', default: 0 })
  durationSeconds!: number;

  @Column('text', { nullable: true })
  detail!: string | null;

  @Column('text', { nullable: true })
  artwork!: ArtworkName | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
