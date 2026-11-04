import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { SessionLogEventEntity } from '../entities/session-log-event.entity';
import { SessionEntity } from '../entities/session.entity';

export interface SessionLogRun {
  runId: string;
  runStartedAt: Date;
  events: { seq: number; event: object }[];
}

/** A log stops growing here, and a replay loads at most this much and one more save. A real lesson makes about 25 rows and 12 KB a minute, so this is hours. */
const LOG_LIMITS = { rows: 5_000, bytes: 10_000_000 };

const LOCK_SESSION_UNLESS_DELETED = 'SELECT replay_deleted_at FROM sessions WHERE id = $1 FOR SHARE';
const MEASURE_LOG = 'SELECT count(*)::int AS rows, coalesce(sum(octet_length(event::text)), 0)::bigint AS bytes FROM session_log_events WHERE session_id = $1';
// A row keeps what it first held, except that a beat can play further, by the rule the agent reports by. A row with no `playedWords` compares as null, so it never changes.
const SAVE_EVENTS = `
  INSERT INTO session_log_events (session_id, run_id, run_started_at, seq, event)
  SELECT DISTINCT ON (saved.seq) $1::uuid, $2::uuid, $3::timestamptz, saved.seq, saved.event
  FROM jsonb_to_recordset($4::jsonb) AS saved(seq integer, event jsonb)
  ON CONFLICT (session_id, run_id, seq) DO UPDATE SET event = EXCLUDED.event
  WHERE (EXCLUDED.event->'playedWords', EXCLUDED.event->'firedCueMs') > (session_log_events.event->'playedWords', session_log_events.event->'firedCueMs')`;

async function isLogFull(manager: EntityManager, sessionId: string): Promise<boolean> {
  const [{ rows, bytes }] = (await manager.query(MEASURE_LOG, [sessionId])) as [{ rows: number; bytes: string }];
  return rows >= LOG_LIMITS.rows || Number(bytes) >= LOG_LIMITS.bytes;
}

@Injectable()
export class SessionLogRepository {
  private readonly events: Repository<SessionLogEventEntity>;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    this.events = dataSource.getRepository(SessionLogEventEntity);
  }

  // Sharing the session's row holds a delete back until these rows are in, so it removes them too. A delete that got there first has marked the row by the time this reads it.
  async saveUnlessDeleted(sessionId: string, { runId, runStartedAt, events }: SessionLogRun): Promise<void> {
    if (events.length === 0) return;
    await this.dataSource.transaction(async (manager) => {
      const [session] = (await manager.query(LOCK_SESSION_UNLESS_DELETED, [sessionId])) as { replay_deleted_at: Date | null }[];
      if (!session || session.replay_deleted_at || (await isLogFull(manager, sessionId))) return;
      await manager.query(SAVE_EVENTS, [sessionId, runId, runStartedAt, JSON.stringify(events)]);
    });
  }

  async listRuns(sessionId: string): Promise<{ startedAt: Date; events: object[] }[]> {
    const rows = await this.events.find({ where: { sessionId }, order: { runStartedAt: 'ASC', runId: 'ASC', seq: 'ASC' } });
    const runs = new Map<string, { startedAt: Date; events: object[] }>();
    for (const { runId, runStartedAt, event } of rows) {
      const run = runs.get(runId) ?? { startedAt: runStartedAt, events: [] };
      run.events.push(event);
      runs.set(runId, run);
    }
    return [...runs.values()];
  }

  async deleteReplayForStudent(studentId: string, sessionId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(SessionEntity, { id: sessionId, studentId }, { recap: null, recapAnswer: null, replayDeletedAt: new Date() });
      await manager.delete(SessionLogEventEntity, { sessionId });
    });
  }
}
