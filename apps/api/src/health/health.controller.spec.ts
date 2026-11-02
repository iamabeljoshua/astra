import type { HealthResponse } from '@astra/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = testingModule.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports that the API is healthy', async () => {
    const expectedResponse: HealthResponse = { status: 'ok' };

    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(expectedResponse);
  });

  it('fails on purpose to prove CI turns red', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'deliberately-wrong' });
  });
});
