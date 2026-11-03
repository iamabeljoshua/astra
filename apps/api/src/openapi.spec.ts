import { Body, Controller, Patch, Post, Put, Req } from '@nestjs/common';
import type { INestApplication, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { LeakingEntityController } from '../test/leaking-entity.controller';
import { ProbeController } from '../test/probe.controller';
import type { CreateProbeBodyDto } from '../test/probe.dto';
import { createApiDocument, serveApiDocs } from './api-docs';
import { AppModule } from './app.module';
import { HealthController } from './health/health.controller';
import { RequestValidationModule } from './request-validation.module';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;
const WRITE_METHODS: readonly string[] = ['post', 'put', 'patch'];
const WRITE_ROUTES_WITHOUT_BODY: readonly string[] = [];
const STUDENT_ID_NAME = /student.?id|auth.?user/i;
const SCHEMA_REF_PREFIX = '#/components/schemas/';
const JSON_CONTENT = 'application/json';
// A DTO imported with `import type` reaches the document as this schema.
const ERASED_DTO_SCHEMA = '#/components/schemas/Function';

interface ProbeBodyInterface {
  name: string;
}

@Controller('unchecked-bodies')
class UncheckedBodiesController {
  @Post('list')
  acceptList(@Body() body: CreateProbeBodyDto[]) {
    return body;
  }

  @Post('type-only-import')
  acceptTypeOnlyImport(@Body() body: CreateProbeBodyDto) {
    return body;
  }

  @Post('interface')
  acceptInterface(@Body() body: ProbeBodyInterface) {
    return body;
  }

  @Post('partial')
  acceptPartial(@Body() body: Partial<ProbeBodyInterface>) {
    return body;
  }

  @Post('pick')
  acceptPick(@Body() body: Pick<ProbeBodyInterface, 'name'>) {
    return body;
  }

  @Post('record')
  acceptRecord(@Body() body: Record<string, string>) {
    return body;
  }

  @Post('named-field')
  acceptNamedField(@Body('name') name: string) {
    return name;
  }

  @Post('unknown')
  acceptUnknown(@Body() body: unknown) {
    return body;
  }

  @Post('raw-request')
  acceptRawRequest(@Req() rawRequest: { body: unknown }) {
    return rawRequest.body;
  }

  @Put('put-interface')
  replaceWithInterface(@Body() body: ProbeBodyInterface) {
    return body;
  }

  @Patch('patch-partial')
  changeWithPartial(@Body() body: Partial<ProbeBodyInterface>) {
    return body;
  }
}

async function createApp(extraControllers: Type<unknown>[] = []) {
  const testingModule = await Test.createTestingModule({
    imports: [RequestValidationModule],
    controllers: extraControllers,
  }).compile();
  return testingModule.createNestApplication();
}

// Preview mode builds routes without running providers, so this needs no database, as `pnpm api:types` does.
function createRealApiPreview() {
  return NestFactory.create(AppModule, { preview: true, logger: false });
}

function findUndocumentedRoutes(document: OpenAPIObject): string[] {
  return Object.entries(document.paths).flatMap(([path, pathItem]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = pathItem[method];
      if (!operation) return [];
      const routeName = `${method} ${path}`;
      const undocumentedParameters = (operation.parameters ?? [])
        .filter((parameter) => !('description' in parameter && parameter.description))
        .map((parameter) => `${routeName} parameter ${JSON.stringify(parameter)}`);
      return operation.summary ? undocumentedParameters : [routeName, ...undocumentedParameters];
    }),
  );
}

function findUndocumentedFields(document: OpenAPIObject): string[] {
  return Object.entries(document.components?.schemas ?? {}).flatMap(([schemaName, schema]) =>
    Object.entries('properties' in schema ? (schema.properties ?? {}) : {})
      .filter(([, field]) => !('description' in field && field.description))
      .map(([fieldName]) => `${schemaName}.${fieldName}`),
  );
}

function findRoutesWithUncheckedBodies(document: OpenAPIObject): string[] {
  return Object.entries(document.paths).flatMap(([path, pathItem]) =>
    HTTP_METHODS.flatMap((method) => {
      const routeName = `${method} ${path}`;
      const requestBody = pathItem[method]?.requestBody;
      if (!requestBody) {
        const isMissing = pathItem[method] && WRITE_METHODS.includes(method);
        return isMissing && !WRITE_ROUTES_WITHOUT_BODY.includes(routeName) ? [routeName] : [];
      }
      const schema = 'content' in requestBody && requestBody.content['application/json']?.schema;
      const hasDto = schema && '$ref' in schema && schema.$ref !== ERASED_DTO_SCHEMA;
      return hasDto ? [] : [routeName];
    }),
  );
}

type DocumentOperation = NonNullable<OpenAPIObject['paths'][string]['get']>;

interface WalkedSchema {
  $ref?: string;
  properties?: Record<string, WalkedSchema>;
  items?: WalkedSchema;
  allOf?: WalkedSchema[];
  anyOf?: WalkedSchema[];
  oneOf?: WalkedSchema[];
}

function getSchemaByRef(document: OpenAPIObject, ref: string): WalkedSchema | undefined {
  return document.components?.schemas?.[ref.replace(SCHEMA_REF_PREFIX, '')] as WalkedSchema | undefined;
}

function findStudentIdFields(document: OpenAPIObject, schema: WalkedSchema, seenRefs: Set<string>): string[] {
  if (schema.$ref) {
    if (seenRefs.has(schema.$ref)) return [];
    seenRefs.add(schema.$ref);
    const target = getSchemaByRef(document, schema.$ref);
    return target ? findStudentIdFields(document, target, seenRefs) : [];
  }
  const children = [...(schema.allOf ?? []), ...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.items ? [schema.items] : [])];
  return [
    ...Object.entries(schema.properties ?? {}).flatMap(([fieldName, field]) => [
      ...(STUDENT_ID_NAME.test(fieldName) ? [fieldName] : []),
      ...findStudentIdFields(document, field, seenRefs),
    ]),
    ...children.flatMap((child) => findStudentIdFields(document, child, seenRefs)),
  ];
}

function findStudentIdInputs(document: OpenAPIObject): string[] {
  return Object.entries(document.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem as Record<string, DocumentOperation>).flatMap(([method, operation]) => {
      const fromParameters = (operation.parameters ?? [])
        .filter((parameter) => 'name' in parameter && STUDENT_ID_NAME.test(parameter.name))
        .map((parameter) => `${method} ${path} parameter ${'name' in parameter ? parameter.name : ''}`);
      const { requestBody } = operation;
      const bodySchema = requestBody && 'content' in requestBody ? requestBody.content[JSON_CONTENT]?.schema : undefined;
      const fromBody = bodySchema ? findStudentIdFields(document, bodySchema as WalkedSchema, new Set()) : [];
      return [...fromParameters, ...fromBody.map((fieldName) => `${method} ${path} body field ${fieldName}`)];
    }),
  );
}

function findEntitySchemas(document: OpenAPIObject): string[] {
  return Object.keys(document.components?.schemas ?? {}).filter((name) => name.endsWith('Entity'));
}

describe('the OpenAPI document', () => {
  describe('for routes and DTOs with comments', () => {
    let app: INestApplication;
    let document: OpenAPIObject;

    beforeAll(async () => {
      app = await createApp([ProbeController]);
      document = createApiDocument(app);
    });

    afterAll(async () => {
      await app.close();
    });

    it('uses a DTO field comment as the field description', () => {
      expect(document.components?.schemas?.CreateProbeBodyDto).toMatchObject({
        properties: { name: { description: 'The name to give the new probe.' } },
      });
    });

    it('uses a controller route comment as the route summary', () => {
      expect(document.paths['/probes']?.post?.summary).toBe('Creates a probe.');
    });

    it('uses a query DTO comment as the parameter description', () => {
      expect(document.paths['/probes']?.get?.parameters).toContainEqual(
        expect.objectContaining({
          name: 'limit',
          in: 'query',
          description: 'The largest number of probes to return.',
        }),
      );
    });

    it('uses a route parameter DTO comment as the parameter description', () => {
      expect(document.paths['/probes/{probeId}']?.get?.parameters).toContainEqual(
        expect.objectContaining({
          name: 'probeId',
          in: 'path',
          description: 'The ID of the probe to read.',
        }),
      );
    });

    it('copies class-validator rules into the field schema', () => {
      expect(document.components?.schemas?.CreateProbeBodyDto).toMatchObject({
        properties: { name: { minLength: 1 } },
      });
    });
  });

  describe('for the real API', () => {
    let app: INestApplication;
    let document: OpenAPIObject;

    beforeAll(async () => {
      app = await createRealApiPreview();
      document = createApiDocument(app);
    });

    afterAll(async () => {
      await app.close();
    });

    it('describes the health response with its DTO', () => {
      expect(document.paths['/health']?.get?.responses[200]).toMatchObject({
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/HealthResponseDto' } },
        },
      });
    });

    it('keeps the literal health status', () => {
      expect(document.components?.schemas?.HealthResponseDto).toMatchObject({
        properties: { status: { enum: ['ok'] } },
      });
    });

    it('has a comment on every route and route parameter', () => {
      expect(findUndocumentedRoutes(document)).toEqual([]);
    });

    it('has a comment on every DTO field', () => {
      expect(findUndocumentedFields(document)).toEqual([]);
    });

    it('has a DTO class in the document for every write route and every body', () => {
      expect(findRoutesWithUncheckedBodies(document)).toEqual([]);
    });

    it('sends no entity from any route', () => {
      expect(findEntitySchemas(document)).toEqual([]);
    });

    it('takes no student ID from any path, query, or body', () => {
      expect(findStudentIdInputs(document)).toEqual([]);
    });
  });

  it('flags every body shape that validation cannot check, and not a DTO body', async () => {
    const app = await createApp([ProbeController, UncheckedBodiesController]);

    expect(findRoutesWithUncheckedBodies(createApiDocument(app))).toEqual([
      'post /unchecked-bodies/list',
      'post /unchecked-bodies/type-only-import',
      'post /unchecked-bodies/interface',
      'post /unchecked-bodies/partial',
      'post /unchecked-bodies/pick',
      'post /unchecked-bodies/record',
      'post /unchecked-bodies/named-field',
      'post /unchecked-bodies/unknown',
      'post /unchecked-bodies/raw-request',
      'put /unchecked-bodies/put-interface',
      'patch /unchecked-bodies/patch-partial',
    ]);

    await app.close();
  });

  it('flags a route that takes a student ID', () => {
    const body = (name: string) => ({ content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } } });
    const document = {
      paths: {
        '/things/{studentId}': { get: { parameters: [{ name: 'studentId', in: 'path' }] } },
        '/direct': { post: { requestBody: body('ThingBodyDto') } },
        '/any-dto-name': { post: { requestBody: body('WriteForStudent') } },
        '/nested': { post: { requestBody: body('OuterBodyDto') } },
        '/in-a-list': { post: { requestBody: body('ListBodyDto') } },
        '/in-a-union': { search: { requestBody: body('UnionBodyDto') } },
        '/looped': { post: { requestBody: body('LoopBodyDto') } },
      },
      components: {
        schemas: {
          ThingBodyDto: { properties: { student_id: {} } },
          WriteForStudent: { properties: { studentId: {} } },
          OuterBodyDto: { properties: { owner: { $ref: '#/components/schemas/ThingBodyDto' } } },
          ListBodyDto: { properties: { owners: { type: 'array', items: { $ref: '#/components/schemas/ThingBodyDto' } } } },
          UnionBodyDto: { properties: { owner: { oneOf: [{ $ref: '#/components/schemas/ThingBodyDto' }] } } },
          LoopBodyDto: { properties: { next: { $ref: '#/components/schemas/LoopBodyDto' }, authUser: {} } },
        },
      },
    } as unknown as OpenAPIObject;

    expect(findStudentIdInputs(document)).toEqual([
      'get /things/{studentId} parameter studentId',
      'post /direct body field student_id',
      'post /any-dto-name body field studentId',
      'post /nested body field student_id',
      'post /in-a-list body field student_id',
      'search /in-a-union body field student_id',
      'post /looped body field authUser',
    ]);
  });

  it('flags a route that sends an entity', async () => {
    const app = await createApp([LeakingEntityController]);

    expect(findEntitySchemas(createApiDocument(app))).toEqual(['StudentEntity']);

    await app.close();
  });
});

describe('the API docs routes', () => {
  async function getDocsStatuses(nodeEnv: string | undefined) {
    const app = await createApp([HealthController]);
    serveApiDocs(app, nodeEnv);
    await app.init();
    const docsPage = await request(app.getHttpServer()).get('/docs');
    const docsJson = await request(app.getHttpServer()).get('/docs-json');
    await app.close();
    return { docsPage: docsPage.status, docsJson: docsJson.status };
  }

  it('serves the page and the document in development', async () => {
    expect(await getDocsStatuses('development')).toEqual({ docsPage: 200, docsJson: 200 });
  });

  it.each([undefined, 'production', 'staging', 'prod'])(
    'serves neither the page nor the document when NODE_ENV is %s',
    async (nodeEnv) => {
      expect(await getDocsStatuses(nodeEnv)).toEqual({ docsPage: 404, docsJson: 404 });
    },
  );
});
