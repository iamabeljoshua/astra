import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const DELETE_AUDIT_ROWS = `
  DELETE FROM auth.audit_log_entries
  WHERE payload->>'actor_id' = $1
    OR payload->>'actor_username' = $2
    OR payload->'traits'->>'user_id' = $1
    OR payload->'traits'->>'user_email' = $2`;
const DELETE_FLOW_ROWS = 'DELETE FROM auth.flow_state WHERE user_id = $1';

// Auth's delete cascades to identities, sessions, and tokens. These two tables have no foreign key to the user, so they stay behind.
@Injectable()
export class AuthTraceRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  eraseTraces({ authUserId, email }: { authUserId: string; email: string | null }): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(DELETE_AUDIT_ROWS, [authUserId, email]);
      await manager.query(DELETE_FLOW_ROWS, [authUserId]);
    });
  }
}
