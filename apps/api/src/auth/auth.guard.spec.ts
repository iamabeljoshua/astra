import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT } from 'jose';
import request from 'supertest';
import { createSigningKey, signWithKey } from '../../test/test-auth';
import type { TestSupabaseAuth } from '../../test/test-auth';
import { createTestApp, createTestStudent, OLD_ENOUGH_BIRTH_DATE } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';
import { createApiDocument } from '../api-docs';
import { isRefusedToken, TokenVerifier } from './token-verifier';

type HttpMethod = 'get' | 'put' | 'post' | 'delete' | 'patch';

const HTTP_METHODS: readonly HttpMethod[] = ['get', 'put', 'post', 'delete', 'patch'];
const PUBLIC_ROUTES: readonly string[] = ['get /health'];
const SIGNED_IN_ROUTES: readonly string[] = ['get /me', 'post /me/birth-date'];
const CLOSED_PORT_URL = 'http://127.0.0.1:1';
const VALID_SESSION = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };
const VALID_PROFILE = { interests: ['Space'], level: 'university', goal: 'exam', voice: 'ada' };
const PAST_SECONDS = Math.floor(Date.now() / 1000) - 60;
const FUTURE_SECONDS = Math.floor(Date.now() / 1000) + 3600;

function encodeSegment(value: object) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function listRoutes(testApp: TestApp) {
  const { paths } = createApiDocument(testApp.app);
  return Object.entries(paths).flatMap(([path, pathItem]) =>
    HTTP_METHODS.filter((method) => pathItem[method]).map((method) => ({
      name: `${method} ${path}`,
      method,
      url: path.replace(/\{[^}]+\}/g, randomUUID()),
    })),
  );
}

type TokenFactory = (auth: TestSupabaseAuth, authUserId: string) => Promise<string>;

const REFUSED_TOKENS: [string, TokenFactory][] = [
  ['an expired token', (auth, id) => auth.signToken(id, { claims: { exp: PAST_SECONDS } })],
  ['a token with no expiry', (auth, id) => auth.signToken(id, { claims: { exp: undefined } })],
  ['a token not valid yet', (auth, id) => auth.signToken(id, { claims: { nbf: FUTURE_SECONDS } })],
  [
    'a token whose user was changed after signing',
    async (auth, id) => {
      const [header, , signature] = (await auth.signToken(id)).split('.');
      const claims = { iss: `${auth.url}/auth/v1`, aud: 'authenticated', role: 'authenticated', sub: randomUUID(), exp: FUTURE_SECONDS };
      return `${header}.${encodeSegment(claims)}.${signature}`;
    },
  ],
  [
    'a token signed by another key with the right key ID',
    async (auth, id) => {
      const otherKey = await createSigningKey();
      const signingKey = { ...otherKey, publicJwk: { ...otherKey.publicJwk, kid: auth.keys[0]?.publicJwk.kid } };
      return auth.signToken(id, { key: signingKey });
    },
  ],
  ['a token from another project, signed with its key', async (auth, id) => auth.signToken(id, { key: await createSigningKey() })],
  ['a token from another project, naming its issuer', (auth, id) => auth.signToken(id, { claims: { iss: 'https://other.supabase.co/auth/v1' } })],
  ['a token with alg none', async (auth, id) => {
    const [, payload] = (await auth.signToken(id)).split('.');
    return `${encodeSegment({ alg: 'none', typ: 'JWT' })}.${payload}.`;
  }],
  ['a shared-secret token signed with the public key', async (auth, id) => {
    const [, payload] = (await auth.signToken(id)).split('.');
    const claims = JSON.parse(Buffer.from(payload as string, 'base64url').toString());
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256', kid: auth.keys[0]?.publicJwk.kid as string })
      .sign(new TextEncoder().encode(JSON.stringify(auth.keys[0]?.publicJwk)));
  }],
  ['a token with no audience', (auth, id) => auth.signToken(id, { claims: { aud: undefined } })],
  ['a token for another audience', (auth, id) => auth.signToken(id, { claims: { aud: 'anon' } })],
  ['a token with the anon role', (auth, id) => auth.signToken(id, { claims: { role: 'anon' } })],
  ['a token with the service role', (auth, id) => auth.signToken(id, { claims: { role: 'service_role' } })],
  ['a token with no user', (auth) => auth.signToken('', { claims: { sub: undefined } })],
  ['a token whose user is not a UUID', (auth) => auth.signToken('not-a-uuid')],
  ['text that is not a token', async () => 'not-a-token'],
];

describe('the API guard', () => {
  let testApp: TestApp;
  let student: TestStudent;
  let otherStudent: TestStudent;

  function api() {
    return request(testApp.app.getHttpServer());
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    student = await createTestStudent(testApp);
    otherStudent = await createTestStudent(testApp);
  });

  afterAll(() => testApp?.close());

  describe('with no valid token', () => {
    it('refuses every route but the public ones, including routes added later', async () => {
      const routes = listRoutes(testApp).filter((route) => !PUBLIC_ROUTES.includes(route.name));
      expect(routes.map((route) => route.name)).toEqual(expect.arrayContaining(['get /sessions', 'put /me/profile']));

      const answers = await Promise.all(
        routes.map(async (route) => [route.name, (await api()[route.method](route.url)).status]),
      );

      expect(answers.filter(([, status]) => status !== 401)).toEqual([]);
    });

    it('answers the health check', async () => {
      await api().get('/health').expect(200, { status: 'ok' });
    });

    it.each([
      ['an empty bearer value', 'Bearer '],
      ['another scheme', 'Basic dXNlcjpwYXNz'],
      ['two values', 'Bearer one two'],
    ])('refuses %s', async (_caseName, authorization) => {
      await api().get('/me').set('Authorization', authorization).expect(401);
    });

    it('takes no token from the query string or the body', async () => {
      await api().get(`/me?access_token=${student.token}`).expect(401);
      await api().post('/me/birth-date').send({ access_token: student.token, birthDate: OLD_ENOUGH_BIRTH_DATE }).expect(401);
    });

    it('accepts the bearer scheme in any letter case, as the HTTP standard says', async () => {
      await api().get('/me').set('Authorization', `bearer ${student.token}`).expect(200);
    });

    it.each(REFUSED_TOKENS)('refuses %s and sends no data', async (_caseName, createToken) => {
      const token = await createToken(testApp.supabaseAuth, student.authUserId);

      const read = await api().get('/sessions').set('Authorization', `Bearer ${token}`);
      const account = await api().get('/me').set('Authorization', `Bearer ${token}`);

      expect([read.status, account.status]).toEqual([401, 401]);
      expect(read.body).toEqual({ message: 'Unauthorized', statusCode: 401 });
    });

    it('accepts a token signed with RS256, which a hosted project may use', async () => {
      const rsaKey = await createSigningKey('RS256');
      testApp.supabaseAuth.keys.push(rsaKey);
      const token = await testApp.supabaseAuth.signToken(student.authUserId, { key: rsaKey });

      await expect(new TokenVerifier(testApp.supabaseAuth.url).getAuthUserId(token)).resolves.toBe(student.authUserId);
    });
  });

  describe('with a token for a user with no student', () => {
    it('refuses every route that holds student data', async () => {
      const token = await testApp.supabaseAuth.signToken(randomUUID());
      const routes = listRoutes(testApp).filter(
        (route) => !PUBLIC_ROUTES.includes(route.name) && !SIGNED_IN_ROUTES.includes(route.name),
      );

      const answers = await Promise.all(
        routes.map(async (route) => [route.name, (await api()[route.method](route.url).set('Authorization', `Bearer ${token}`)).status]),
      );

      expect(answers.filter(([, status]) => status !== 403)).toEqual([]);
    });

    it('asks for the date of birth and has no student to show', async () => {
      const token = await testApp.supabaseAuth.signToken(randomUUID());

      await api().get('/me').set('Authorization', `Bearer ${token}`).expect(200, { status: 'needs_birth_date', student: null });
    });
  });

  describe('between two students', () => {
    function withToken(owner: TestStudent) {
      return {
        get: (url: string) => api().get(url).set('Authorization', `Bearer ${owner.token}`),
        post: (url: string) => api().post(url).set('Authorization', `Bearer ${owner.token}`),
        put: (url: string) => api().put(url).set('Authorization', `Bearer ${owner.token}`),
      };
    }

    it('gives each student only their own account', async () => {
      const first = await withToken(student).get('/me').expect(200);
      const second = await withToken(otherStudent).get('/me').expect(200);

      expect(first.body.student.id).toBe(student.studentId);
      expect(second.body.student.id).toBe(otherStudent.studentId);
    });

    it('gives each student only their own sessions, and a write stays with its owner', async () => {
      const { body: otherSession } = await withToken(otherStudent).post('/sessions').send(VALID_SESSION).expect(201);
      const { body: ownSession } = await withToken(student).post('/sessions').send(VALID_SESSION).expect(201);

      const { body: ownSessions } = await withToken(student).get('/sessions').expect(200);
      const { body: otherSessions } = await withToken(otherStudent).get('/sessions').expect(200);

      expect(ownSessions.map((session: { id: string }) => session.id)).toEqual([ownSession.id]);
      expect(otherSessions.map((session: { id: string }) => session.id)).toEqual([otherSession.id]);
    });

    it('keeps a profile write with its owner', async () => {
      await withToken(student).put('/me/profile').send(VALID_PROFILE).expect(200);

      const { body } = await withToken(otherStudent).get('/me').expect(200);

      expect(body.student.profile).toBeNull();
    });

    it.each([
      ['get', (id: string) => `/students/${id}`],
      ['put', (id: string) => `/students/${id}/profile`],
      ['get', (id: string) => `/students/${id}/sessions`],
      ['post', (id: string) => `/students/${id}/sessions`],
      ['get', (id: string) => `/me/${id}`],
      ['get', (id: string) => `/sessions/${id}`],
    ] as const)('finds no %s route that names another student', async (method, getUrl) => {
      const server = api();
      const response = await server[method](getUrl(otherStudent.studentId))
        .set('Authorization', `Bearer ${student.token}`)
        .send(method === 'get' ? undefined : VALID_SESSION);

      expect(response.status).toBe(404);
    });

    it('ignores a student ID sent in the query string', async () => {
      const { body } = await withToken(student).get(`/me?studentId=${otherStudent.studentId}`).expect(200);

      expect(body.student.id).toBe(student.studentId);
    });

    it('refuses a student ID sent in a body', async () => {
      await withToken(student).post('/sessions').send({ ...VALID_SESSION, studentId: otherStudent.studentId }).expect(400);
      await withToken(student).put('/me/profile').send({ ...VALID_PROFILE, studentId: otherStudent.studentId }).expect(400);
    });
  });

  describe('when the signing keys cannot be read', () => {
    let keyServer: Server;

    afterEach(async () => {
      keyServer?.closeAllConnections();
      await new Promise((resolve) => (keyServer ? keyServer.close(resolve) : resolve(undefined)));
    });

    async function startKeyServer(status: number, body: string) {
      keyServer = createServer((_request, response) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(body);
      });
      await new Promise<void>((resolve) => keyServer.listen(0, '127.0.0.1', resolve));
      return `http://127.0.0.1:${(keyServer.address() as AddressInfo).port}`;
    }

    it.each([
      ['answers 500', 500, '{}'],
      ['answers with text that is not JSON', 200, 'not json'],
      ['answers with no key list', 200, '{"nothing":true}'],
    ])('does not blame the token when the key server %s', async (_caseName, status, body) => {
      const verifier = new TokenVerifier(await startKeyServer(status, body));
      const key = await createSigningKey();
      const token = await signWithKey(key, { sub: randomUUID() });

      const thrown = await verifier.getAuthUserId(token).catch((error: unknown) => error);

      expect(isRefusedToken(thrown)).toBe(false);
    });

    it('answers 503 and sends no data when the key server is down', async () => {
      const appWithoutKeys = await createTestApp({ supabaseUrl: CLOSED_PORT_URL });
      const token = await appWithoutKeys.supabaseAuth.signToken(randomUUID());

      try {
        await request(appWithoutKeys.app.getHttpServer())
          .get('/sessions')
          .set('Authorization', `Bearer ${token}`)
          .expect(503, { message: 'Service Unavailable', statusCode: 503 });
      } finally {
        await appWithoutKeys.close();
      }
    });
  });
});
