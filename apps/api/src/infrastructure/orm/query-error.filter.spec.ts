import { Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { QueryFailedError } from 'typeorm';
import { createTestApp, OLD_ENOUGH_BIRTH_DATE } from '../../../test/test-database';
import type { TestApp } from '../../../test/test-database';
import { QueryErrorFilter } from './query-error.filter';

const REQUEST_VALUE = 'maya.parent@example.com';

describe('a failed database query', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(() => testApp?.close());

  it('logs the code and leaves out a request value that Postgres repeats in its message', async () => {
    const queryError = await testApp.app.get(DataSource).query('SELECT $1::uuid', [REQUEST_VALUE]).catch((error: unknown) => error);
    expect(String(queryError)).toContain(REQUEST_VALUE);
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const response = { status: () => ({ json: () => undefined }) };
    const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;

    new QueryErrorFilter().catch(queryError as QueryFailedError, host);

    const logged = logError.mock.calls.flat().join(' ');
    logError.mockRestore();
    expect(logged).toBe('A database query failed: code 22P02, constraint none');
  });

  it('answers 500 and logs no value from the request', async () => {
    const authUserId = randomUUID();
    const token = await testApp.supabaseAuth.signToken(authUserId);
    const logged: string[] = [];
    const captureWrite = (text: string | Uint8Array) => {
      logged.push(String(text));
      return true;
    };
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(captureWrite);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(captureWrite);
    await testApp.app.get(DataSource).query('ALTER TABLE "students" RENAME COLUMN "birth_date" TO "hidden_birth_date"');

    try {
      await request(testApp.app.getHttpServer())
        .post('/me/birth-date')
        .set('Authorization', `Bearer ${token}`)
        .send({ birthDate: OLD_ENOUGH_BIRTH_DATE })
        .expect(500, { statusCode: 500, message: 'Internal server error' });
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
      await testApp.app.get(DataSource).query('ALTER TABLE "students" RENAME COLUMN "hidden_birth_date" TO "birth_date"');
    }

    const allLogs = logged.join('');
    expect(allLogs).toContain('A database query failed');
    expect(allLogs).not.toContain(authUserId);
    expect(allLogs).not.toContain(OLD_ENOUGH_BIRTH_DATE);
    expect(allLogs).not.toContain(token);
  });
});
