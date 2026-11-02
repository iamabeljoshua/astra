import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProbeController } from '../test/probe.controller';
import { AppModule } from './app.module';

const VALID_PROBE_ID = '0b0e9c52-6d0c-4f3b-9a53-3f5f0d3f7c11';

describe('request validation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = testingModule.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function expectBadRequestNaming(response: request.Response, fieldName: string) {
    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining(fieldName)]),
    );
  }

  it('rejects a bad body and names the field', async () => {
    const response = await request(app.getHttpServer()).post('/probes').send({ name: 42 });

    expectBadRequestNaming(response, 'name');
  });

  it('rejects a body that leaves out a required field and names the field', async () => {
    const response = await request(app.getHttpServer()).post('/probes').send({});

    expectBadRequestNaming(response, 'name');
  });

  it('rejects a body field that the DTO does not declare and names the field', async () => {
    const response = await request(app.getHttpServer())
      .post('/probes')
      .send({ name: 'first', undeclaredField: true });

    expectBadRequestNaming(response, 'undeclaredField');
  });

  it('accepts a valid body', async () => {
    await request(app.getHttpServer())
      .post('/probes')
      .send({ name: 'first' })
      .expect(201, { name: 'first' });
  });

  it('rejects a bad query string and names the field', async () => {
    const response = await request(app.getHttpServer()).get('/probes?limit=many');

    expectBadRequestNaming(response, 'limit');
  });

  it('rejects a query field that the DTO does not declare and names the field', async () => {
    const response = await request(app.getHttpServer()).get('/probes?limit=1&undeclaredField=1');

    expectBadRequestNaming(response, 'undeclaredField');
  });

  it('turns a valid query string into the types that the DTO declares', async () => {
    await request(app.getHttpServer()).get('/probes?limit=5').expect(200, { limit: 5 });
  });

  it('rejects a bad route parameter and names the field', async () => {
    const response = await request(app.getHttpServer()).get('/probes/not-a-uuid');

    expectBadRequestNaming(response, 'probeId');
  });

  it('accepts a valid route parameter', async () => {
    await request(app.getHttpServer())
      .get(`/probes/${VALID_PROBE_ID}`)
      .expect(200, { probeId: VALID_PROBE_ID });
  });
});
