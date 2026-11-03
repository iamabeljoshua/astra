import { createApiClient } from '../api/client';

type JsonContent<Body> = { content: { 'application/json': Body } };

interface ThingPaths {
  '/things': {
    get: {
      parameters: { query: { limit: number } };
      responses: { 200: JsonContent<{ id: string }[]> };
    };
    post: {
      requestBody: JsonContent<{ title: string }>;
      responses: { 201: JsonContent<{ id: string; title: string }> };
    };
  };
  '/things/{thingId}': {
    get: {
      parameters: { path: { thingId: string } };
      responses: { 200: JsonContent<{ id: string }> };
    };
    delete: {
      parameters: { path: { thingId: string } };
      responses: { 204: { content?: never } };
    };
  };
}

export const things = createApiClient<ThingPaths>('http://localhost/api');
