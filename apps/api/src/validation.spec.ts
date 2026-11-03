import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { FieldMessagesProbeController } from '../test/field-messages-probe.controller';
import { ProbeController } from '../test/probe.controller';
import { RequestValidationModule } from './request-validation.module';

const VALID_PROBE_ID = '0b0e9c52-6d0c-4f3b-9a53-3f5f0d3f7c11';
const VALID_PROBE_BODY = {
  name: 'first',
  owner: { ownerName: 'Ada' },
  sensors: [{ sensorName: 'depth' }],
};

const VALID_FIELD_ITEM = { label: 'Telescope', nickname: 'Scope' };
const VALID_FIELD_PROBE = {
  nickname: 'Ada',
  subject: 'Physics',
  note: 'A note',
  tags: ['first'],
  labels: ['first'],
  startsAt: '2020-01-01T00:00:00Z',
  inner: VALID_FIELD_ITEM,
  items: [VALID_FIELD_ITEM],
  looseItems: [VALID_FIELD_ITEM],
};

type SendRequest = (server: Parameters<typeof request>[0]) => request.Test;

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
      controllers: [ProbeController, FieldMessagesProbeController],
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

  describe('the body of a validation 400', () => {
    let defaultPipeApp: INestApplication;

    beforeAll(async () => {
      const testingModule = await Test.createTestingModule({
        controllers: [ProbeController, FieldMessagesProbeController],
        providers: [
          {
            provide: APP_PIPE,
            useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
          },
        ],
      }).compile();
      defaultPipeApp = testingModule.createNestApplication();
      await defaultPipeApp.init();
    });

    afterAll(async () => {
      await defaultPipeApp.close();
    });

    it('adds the rejected fields as data next to the usual fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/field-probes')
        .send({ ...VALID_FIELD_PROBE, inner: { ...VALID_FIELD_ITEM, label: 42 } });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: ['inner.label must have visible text and no invalid characters'],
        error: 'Bad Request',
        statusCode: 400,
        fieldMessages: { 'inner.label': ['inner.label must have visible text and no invalid characters'] },
      });
    });

    const BODY_CASES: [string, object, Record<string, string[]>][] = [
      ['a custom message', { nickname: 42 }, { nickname: ['Pick a nickname.'] }],
      ['a custom message that names another field', { subject: 42 }, { subject: ['title must be unique'] }],
      ['IsStorableText', { note: '\u200b' }, { note: ['note must have visible text and no invalid characters'] }],
      ['a rule on each value', { tags: [42] }, { tags: ['each value in tags must be a string'] }],
      ['ArrayUnique', { labels: ['first', 'first'] }, { labels: ["All labels's elements must be unique"] }],
      ['an undeclared field', { extra: 1 }, { extra: ['property extra should not exist'] }],
      ['an undeclared field with a space', { 'two words': 1 }, { 'two words': ['property two words should not exist'] }],
      ['a custom message inside a nested object', { inner: { ...VALID_FIELD_ITEM, nickname: 42 } }, { 'inner.nickname': ['inner.Pick a nickname.'] }],
      ['an undeclared field inside a nested object', { inner: { ...VALID_FIELD_ITEM, extra: 1 } }, { 'inner.extra': ['inner.property extra should not exist'] }],
      [
        'a nested object of the wrong type',
        { inner: 'text' },
        { inner: ['inner must be an object', 'nested property inner must be either object or array'] },
      ],
      [
        'a field inside the second list item',
        { items: [VALID_FIELD_ITEM, { ...VALID_FIELD_ITEM, label: 42 }] },
        { 'items.1.label': ['items.1.label must have visible text and no invalid characters'] },
      ],
      ['a custom message inside a list item', { items: [{ ...VALID_FIELD_ITEM, nickname: 42 }] }, { 'items.0.nickname': ['items.0.Pick a nickname.'] }],
      ['an undeclared field inside a list item', { items: [{ ...VALID_FIELD_ITEM, extra: 1 }] }, { 'items.0.extra': ['items.0.property extra should not exist'] }],
      [
        'a list item that is not an object',
        { items: ['text'] },
        {
          items: ['each value in items must be an object'],
          'items.0': ['items.each value in nested property items must be either object or array'],
        },
      ],
      [
        'a list item that is not an object, with no rule on the list',
        { looseItems: ['text'] },
        { 'looseItems.0': ['looseItems.each value in nested property looseItems must be either object or array'] },
      ],
    ];

    it.each(BODY_CASES)('names the field for %s', async (_caseName, bodyChange, fieldMessages) => {
      const response = await request(app.getHttpServer())
        .post('/field-probes')
        .send({ ...VALID_FIELD_PROBE, ...bodyChange });

      expect(response.status).toBe(400);
      expect(response.body.fieldMessages).toEqual(fieldMessages);
    });

    it('names the field for a default MinDate message, whose date depends on the time zone', async () => {
      const response = await request(app.getHttpServer())
        .post('/field-probes')
        .send({ ...VALID_FIELD_PROBE, startsAt: '1990-01-01T00:00:00Z' });

      expect(response.body.fieldMessages).toEqual({
        startsAt: [expect.stringMatching(/^minimal allowed date for startsAt is /)],
      });
    });

    const URL_CASES: [string, string, Record<string, string[]>][] = [
      ['a query value', '/field-probes?limit=many', { limit: ['limit must be an integer number'] }],
      ['a query value that ToStrictInteger leaves as text', '/field-probes?limit=0x10', { limit: ['limit must be an integer number'] }],
      ['an undeclared query field', '/field-probes?limit=1&extra=1', { extra: ['property extra should not exist'] }],
      ['a route parameter', '/field-probes/not-a-uuid', { probeId: ['probeId must be a UUID'] }],
    ];

    it.each(URL_CASES)('names the field for %s', async (_caseName, url, fieldMessages) => {
      const response = await request(app.getHttpServer()).get(url);

      expect(response.status).toBe(400);
      expect(response.body.fieldMessages).toEqual(fieldMessages);
    });

    const HUGE_LIST_ITEM_COUNT = 33_000;
    const hugeBody = {
      ...VALID_PROBE_BODY,
      sensors: Array.from({ length: HUGE_LIST_ITEM_COUNT }, () => ({})),
    };

    const REQUESTS_TO_COMPARE: [string, SendRequest][] = [
      ...BODY_CASES.map(([caseName, bodyChange]): [string, SendRequest] => [
        caseName,
        (server) => request(server).post('/field-probes').send({ ...VALID_FIELD_PROBE, ...bodyChange }),
      ]),
      ...URL_CASES.map(([caseName, url]): [string, SendRequest] => [caseName, (server) => request(server).get(url)]),
      ['every field missing', (server) => request(server).post('/field-probes').send({})],
      ['more errors than the message limit', (server) => request(server).post('/probes').send(hugeBody)],
    ];

    it.each(REQUESTS_TO_COMPARE)('keeps the rest of the default pipe body for %s', async (_caseName, send) => {
      const { fieldMessages, ...body } = (await send(app.getHttpServer())).body;
      const defaultBody = (await send(defaultPipeApp.getHttpServer())).body;

      expect(body).toEqual(defaultBody);
      expect(fieldMessages).toEqual(expect.any(Object));
    });

    it('holds every sentence of message under a field', async () => {
      const { message, fieldMessages } = (await request(app.getHttpServer()).post('/field-probes').send({})).body;

      expect(Object.values(fieldMessages).flat()).toEqual(expect.arrayContaining(message));
    });

    it('stays within the limit of the default pipe when a body has too many errors', async () => {
      const { message, fieldMessages } = (await request(app.getHttpServer()).post('/probes').send(hugeBody)).body;

      expect(message.at(-1)).toBe('Further validation errors were omitted');
      expect(Object.keys(fieldMessages).length).toBeLessThan(HUGE_LIST_ITEM_COUNT);
    });

    it('sends an empty field list when the body is nested too deeply', async () => {
      const response = await request(app.getHttpServer())
        .post('/probes')
        .set('content-type', 'application/json')
        .send(nestedList(15_000));

      expect(response.body).toEqual({
        message: ['The request is nested too deeply.'],
        error: 'Bad Request',
        statusCode: 400,
        fieldMessages: {},
      });
    });

    it('leaves a 400 for malformed JSON without field data, because the pipe did not reject it', async () => {
      const response = await request(app.getHttpServer())
        .post('/probes')
        .set('content-type', 'application/json')
        .send('{bad');

      expect(response.status).toBe(400);
      expect(response.body).not.toHaveProperty('fieldMessages');
    });
  });
});
