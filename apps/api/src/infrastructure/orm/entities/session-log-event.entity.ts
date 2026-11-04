import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { SessionEntity } from './session.entity';

// One row per event of a session's log, so a beat that plays further replaces its own row and a repeated save changes nothing. No audio passes through here.
@Entity('session_log_events')
export class SessionLogEventEntity {
  @PrimaryColumn('uuid', { name: 'session_id' })
  sessionId!: string;

  @ManyToOne(() => SessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session?: SessionEntity;

  @PrimaryColumn('uuid', { name: 'run_id' })
  runId!: string;

  @PrimaryColumn('integer')
  seq!: number;

  @Column('timestamptz', { name: 'run_started_at' })
  runStartedAt!: Date;

  @Column('jsonb')
  event!: object;
}
