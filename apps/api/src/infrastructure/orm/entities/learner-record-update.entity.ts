import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { SessionEntity } from './session.entity';

// Says that one room's update has been applied, so a repeat adds nothing and a note the student deleted stays gone. It holds no words of theirs.
@Entity('learner_record_updates')
export class LearnerRecordUpdateEntity {
  @PrimaryColumn('uuid', { name: 'session_id' })
  sessionId!: string;

  @ManyToOne(() => SessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session?: SessionEntity;

  /** The room's name, because one session can have several rooms and each writes once. */
  @PrimaryColumn('text', { name: 'update_key' })
  updateKey!: string;

  @CreateDateColumn({ name: 'applied_at', type: 'timestamptz' })
  appliedAt!: Date;
}
