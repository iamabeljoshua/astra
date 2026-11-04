import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VirtualColumn,
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

  @Column('text', { name: 'topic_id', nullable: true })
  topicId!: string | null;

  /** What the session's end said. Only the agent writes it, and only the web app reads inside it. */
  @Column('jsonb', { nullable: true })
  recap!: object | null;

  /** Set when the student deletes the replay, so a tutor still closing cannot save it back. */
  @Column('timestamptz', { name: 'replay_deleted_at', nullable: true })
  replayDeletedAt!: Date | null;

  /** Asked of the key's first column on every read, so it cannot go stale when a log is saved or deleted. */
  @VirtualColumn({ type: 'boolean', query: (session) => `SELECT EXISTS (SELECT 1 FROM session_log_events logged WHERE logged.session_id = ${session}.id)` })
  hasLog!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
