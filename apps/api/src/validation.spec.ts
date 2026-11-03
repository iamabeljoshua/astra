import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProbeController } from '../test/probe.controller';
import { RequestValidationModule } from './request-validation.module';

const VALID_PROBE_ID = '0b0e9c52-6d0c-4f3b-9a53-3f5f0d3f7c11';
const VALID_PROBE_BODY = {
  name: 'first',
  owner: { ownerName: 'Ada' },
  sensors: [{ sensorName: 'depth' }],
};

function nestedList(depth: number): string {
  return '['.repeat(depth) + ']'.repeat(depth);
}

function nestedObject(depth: number): string {
  return '{"a":'.repeat(depth) + '1' + '}'.repeat(depth);
}

describe('request validation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [RequestValidationModule],
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
    const response = await request(app.getHttpServer())
      .post('/probes')
      .send({ ...VALID_PROBE_BODY, name: 42 });

    expectBadRequestNaming(response, 'name');
  });

  it('rejects a body that leaves out a required field and names the field', async () => {
    const response = await request(app.getHttpServer())
      .post('/probes')
      .send({ ...VALID_PROBE_BODY, name: undefined });

    expectBadRequestNaming(response, 'name');
  });

  it('rejects a body field that the DTO does not declare and names the field', async () => {
    const response = await request(app.getHttpServer())
      .post('/probes')
      .send({ ...VALID_PROBE_BODY, undeclaredField: true });

    expectBadRequestNaming(response, 'undeclaredField');
  });

  it.each([
    ['a missing nested field', { owner: undefined }, 'owner'],
    ['an array where a nested object belongs', { owner: [{ ownerName: 'Ada' }] }, 'owner'],
    ['a bad field inside a nested object', { owner: { ownerName: 42 } }, 'owner.ownerName'],
    ['a missing list field', { sensors: undefined }, 'sensors'],
    ['an object where a list belongs', { sensors: { sensorName: 'depth' } }, 'sensors'],
    ['a bad field inside a list item', { sensors: [{ sensorName: 42 }] }, 'sensors.0.sensorName'],
    ['a list inside a list', { sensors: [[{ sensorName: 'depth' }]] }, 'sensors'],
    ['an empty list', { sensors: [] }, 'sensors'],
  ])('rejects %s and names the field', async (_caseName, bodyChange, fieldName) => {
    const response = await request(app.getHttpServer())
      .post('/probes')
      .send({ ...VALID_PROBE_BODY, ...bodyChange });

    expectBadRequestNaming(response, fieldName);
  });

  it('accepts a valid body', async () => {
    await request(app.getHttpServer())
      .post('/probes')
      .send(VALID_PROBE_BODY)
      .expect(201, VALID_PROBE_BODY);
  });

  it('rejects a bad query string and names the field', async () => {
    const response = await request(app.getHttpServer()).get('/probes?limit=many');

    expectBadRequestNaming(response, 'limit');
  });

  it.each(['0x10', '0b11', '0o7', '1e1', ' 5', '5 ', '+5', '5.0', '', 'Infinity'])(
    'rejects a query number written as "%s" and names the field',
    async (limit) => {
      const response = await request(app.getHttpServer()).get(
        `/probes?limit=${encodeURIComponent(limit)}`,
      );

      expectBadRequestNaming(response, 'limit');
    },
  );

  it('rejects a query field that the DTO does not declare and names the field', async () => {
    const response = await request(app.getHttpServer()).get('/probes?limit=1&undeclaredField=1');

    expectBadRequestNaming(response, 'undeclaredField');
  });

  it('gives the route an instance of the DTO, with the types that the DTO declares', async () => {
    await request(app.getHttpServer())
      .get('/probes?limit=5')
      .expect(200, { limit: 5, isDtoInstance: true });
  });

  it.each([
    ['a list in a field', (depth: number) => `{"name":${nestedList(depth)}}`],
    ['an object in a field', (depth: number) => `{"name":${nestedObject(depth)}}`],
    ['an undeclared field', (depth: number) => `{"undeclaredField":${nestedList(depth)}}`],
    ['a list of nested DTOs', (depth: number) => `{"sensors":${nestedList(depth)}}`],
    ['a nested DTO', (depth: number) => `{"owner":${nestedObject(depth)}}`],
    ['the body itself', (depth: number) => nestedList(depth)],
  ])('answers a 400, not a server error, for %s nested very deep', async (_caseName, createBody) => {
    for (const depth of [5_000, 15_000]) {
      await request(app.getHttpServer())
        .post('/probes')
        .set('content-type', 'application/json')
        .send(createBody(depth))
        .expect(400);
    }
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
