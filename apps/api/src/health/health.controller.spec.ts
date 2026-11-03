import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { HealthResponseDto } from './health-response.dto';
import { HealthController } from './health.controller';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    app = testingModule.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports that the API is healthy', async () => {
    const expectedResponse: HealthResponseDto = { status: 'ok' };

    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(expectedResponse);
  });
});
