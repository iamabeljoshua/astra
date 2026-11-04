import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { LEARNER_NOTE_KINDS } from '../../../learner-record/learner-note-options';
import type { LearnerEvidence, LearnerNoteKind } from '../../../learner-record/learner-note-options';
import { SessionEntity } from './session.entity';
import { StudentEntity } from './student.entity';

@Entity('learner_notes')
@Index(['studentId', 'notedAt'])
@Unique(['studentId', 'sessionId', 'kind', 'topicKey'])
export class LearnerNoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'student_id' })
  studentId!: string;

  @ManyToOne(() => StudentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: StudentEntity;

  /** The session the note came from. */
  @Column('uuid', { name: 'session_id' })
  sessionId!: string;

  @ManyToOne(() => SessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session?: SessionEntity;

  @Column({ type: 'enum', enum: LEARNER_NOTE_KINDS, enumName: 'learner_note_kind' })
  kind!: LearnerNoteKind;

  @Column('text')
  topic!: string;

  /** The topic in lowercase with its punctuation gone, so one session cannot note the same thing twice. */
  @Column('text', { name: 'topic_key' })
  topicKey!: string;

  @Column('text', { nullable: true })
  detail!: string | null;

  @Column('jsonb')
  evidence!: LearnerEvidence[];

  @CreateDateColumn({ name: 'noted_at', type: 'timestamptz' })
  notedAt!: Date;
}
