import type { DataSourceOptions } from 'typeorm';
import { SessionEntity } from '../sessions/session.entity';
import { StudentProfileEntity } from '../students/student-profile.entity';
import { StudentEntity } from '../students/student.entity';
import { CreateStudentsAndSessions1793666578779 } from './migrations/1793666578779-create-students-and-sessions';

// Supabase's Data API serves the public schema, and anon and authenticated have no USAGE on this one.
export const APP_SCHEMA = 'app';

export function createDataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    schema: APP_SCHEMA,
    entities: [StudentEntity, StudentProfileEntity, SessionEntity],
    migrations: [CreateStudentsAndSessions1793666578779],
    synchronize: false,
    // Core Postgres has gen_random_uuid, and hosted Supabase keeps extensions outside public, so install none.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    logging: ['error'],
  };
}
