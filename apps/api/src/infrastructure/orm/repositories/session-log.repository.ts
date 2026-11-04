import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Repository } from 'typeorm';
import { SessionLogEventEntity } from '../entities/session-log-event.entity';

export interface SessionLogRun {
  runId: string;
  runStartedAt: Date;
  events: { seq: number; event: object }[];
}

@Injectable()
export class SessionLogRepository {
  private readonly events: Repository<SessionLogEventEntity>;

  constructor(@InjectDataSource() dataSource: DataSource) {
    this.events = dataSource.getRepository(SessionLogEventEntity);
  }

  async saveEvents(sessionId: string, { runId, runStartedAt, events }: SessionLogRun): Promise<void> {
    if (events.length === 0) return;
    await this.events.upsert(events.map(({ seq, event }) => ({ sessionId, runId, runStartedAt, seq, event })), ['sessionId', 'runId', 'seq']);
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

  async deleteForSession(sessionId: string): Promise<void> {
    await this.events.delete({ sessionId });
  }
}
