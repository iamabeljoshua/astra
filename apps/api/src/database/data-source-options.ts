import type { DataSourceOptions } from 'typeorm';
import { SessionEntity } from '../sessions/session.entity';
import { ClosedAccountEntity } from '../students/closed-account.entity';
import { StudentProfileEntity } from '../students/student-profile.entity';
import { StudentEntity } from '../students/student.entity';
import { CreateStudentsAndSessions1793666578779 } from './migrations/1793666578779-create-students-and-sessions';
import { AddSignInAndAgeGate1793686438335 } from './migrations/1793686438335-add-sign-in-and-age-gate';

// Supabase's Data API serves the public schema, and anon and authenticated have no USAGE on this one.
export const APP_SCHEMA = 'app';

export function createDataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    schema: APP_SCHEMA,
    entities: [StudentEntity, StudentProfileEntity, SessionEntity, ClosedAccountEntity],
    migrations: [CreateStudentsAndSessions1793666578779, AddSignInAndAgeGate1793686438335],
    synchronize: false,
    // Core Postgres has gen_random_uuid, and hosted Supabase keeps extensions outside public, so install none.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    // TypeORM's log of a failed query holds its parameters, so QueryErrorFilter logs failures instead.
    logging: false,
  };
}
