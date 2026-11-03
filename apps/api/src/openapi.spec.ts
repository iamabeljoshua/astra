import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProbeController } from '../test/probe.controller';
import { createApiDocument, serveApiDocs } from './api-docs';
import { AppModule } from './app.module';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

async function createApp(extraControllers: (typeof ProbeController)[] = []) {
  const testingModule = await Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  }).compile();
  return testingModule.createNestApplication();
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
      app = await createApp();
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
  });
});

describe('the API docs routes', () => {
  async function getDocsStatuses(nodeEnv: string | undefined) {
    const app = await createApp();
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
