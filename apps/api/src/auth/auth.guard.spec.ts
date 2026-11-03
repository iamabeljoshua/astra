import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT } from 'jose';
import request from 'supertest';
import { PlantedRoutesModule } from '../../test/planted-routes';
import {
  findLayersAddedToEmptyApp,
  findRoutesIgnoringIdentity,
  findRoutesWithoutNoStore,
  getRouteAnswers,
  listRoutes,
} from '../../test/route-table';
import { createSigningKey, signWithKey } from '../../test/test-auth';
import type { TestSupabaseAuth } from '../../test/test-auth';
import { createTestApp, createTestStudent, OLD_ENOUGH_BIRTH_DATE } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';
import { getAcceptedSignInMethods, isRefusedToken, TokenVerifier } from './token-verifier';

const PUBLIC_ROUTES: readonly string[] = ['get /health', 'get /parent-consent/:token', 'post /parent-consent/accept'];
const SIGNED_IN_ROUTES: readonly string[] = ['get /me', 'post /me/birth-date'];
const BEFORE_CONSENT_ROUTES: readonly string[] = ['put /me/parent-consent'];
const CLOSED_PORT_URL = 'http://127.0.0.1:1';
const VALID_SESSION = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };
const VALID_PROFILE = { name: 'Maya', interests: ['Space'], level: 'university', goal: 'exam', voice: 'ada', firstQuestion: null };
const PAST_SECONDS = Math.floor(Date.now() / 1000) - 60;
const FUTURE_SECONDS = Math.floor(Date.now() / 1000) + 3600;
const ONE_MINUTE_MS = 60_000;
const UNDER_EIGHTEEN_BIRTH_DATE = `${new Date().getUTCFullYear() - 15}-06-01`;
const JWKS_COOLDOWN_MS = 31_000;

function verifierFor(supabaseUrl: string) {
  return new TokenVerifier(supabaseUrl, getAcceptedSignInMethods(undefined));
}

function encodeSegment(value: object) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

type TokenFactory = (auth: TestSupabaseAuth, authUserId: string) => Promise<string>;

function signedInWith(auth: TestSupabaseAuth, authUserId: string, method: string) {
  return auth.signToken(authUserId, { claims: { amr: [{ method, timestamp: PAST_SECONDS }] } });
}

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
  ['a token from a password', (auth, id) => signedInWith(auth, id, 'password')],
  ['a token from an anonymous sign-in', (auth, id) => auth.signToken(id, { claims: { amr: [{ method: 'anonymous' }], is_anonymous: true } })],
  ['a token that names no sign-in method', (auth, id) => auth.signToken(id, { claims: { amr: undefined } })],
  ['a token with an empty list of sign-in methods', (auth, id) => auth.signToken(id, { claims: { amr: [] } })],
  ['a token whose sign-in method is not a list', (auth, id) => auth.signToken(id, { claims: { amr: 'magiclink' } })],
  ['a token whose sign-in methods are plain strings', (auth, id) => auth.signToken(id, { claims: { amr: ['magiclink'] } })],
  ['a token with an empty sign-in method', (auth, id) => auth.signToken(id, { claims: { amr: [null] } })],
  ['a token whose sign-in method is a list', (auth, id) => auth.signToken(id, { claims: { amr: [{ method: ['magiclink'] }] } })],
  ['a token that adds a password to a link', (auth, id) => auth.signToken(id, { claims: { amr: [{ method: 'magiclink' }, { method: 'password' }] } })],
  ['a token from an unknown sign-in method', (auth, id) => signedInWith(auth, id, 'recovery')],
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
    it('refuses every route in the Express route table but the public ones, including routes added later', async () => {
      const routes = listRoutes(testApp.app).filter((route) => !PUBLIC_ROUTES.includes(route.name));
      expect(routes.map((route) => route.name)).toEqual(
        expect.arrayContaining(['get /sessions', 'put /me/profile', 'get /home']),
      );

      const answers = await getRouteAnswers({ app: testApp.app, routes });

      expect(answers.filter((answer) => !answer.endsWith('401'))).toEqual([]);
    });

    it('adds no middleware that the route walk cannot call', async () => {
      expect(await findLayersAddedToEmptyApp(testApp.app)).toEqual([]);
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

    it('logs why it refused a token, and nothing from the token', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const token = await testApp.supabaseAuth.signToken(student.authUserId, {
        claims: { iss: 'https://other.supabase.co/auth/v1' },
      });

      await api().get('/me').set('Authorization', `Bearer ${token}`).expect(401);

      const logged = warn.mock.calls.flat().join(' ');
      warn.mockRestore();
      expect(logged).toContain('ERR_JWT_CLAIM_VALIDATION_FAILED iss');
      expect(logged).not.toContain(token);
      expect(logged).not.toContain(student.authUserId);
      expect(logged).not.toContain('other.supabase.co');
    });

    it('accepts a token signed with RS256, which a hosted project may use', async () => {
      const rsaKey = await createSigningKey('RS256');
      testApp.supabaseAuth.keys.push(rsaKey);
      const token = await testApp.supabaseAuth.signToken(student.authUserId, { key: rsaKey });

      await expect(verifierFor(testApp.supabaseAuth.url).getAuthUserId(token)).resolves.toBe(student.authUserId);
    });
  });

  describe('by how the student signed in', () => {
    it.each(['otp', 'magiclink', 'email/signup', 'oauth'])('accepts a token from %s', async (method) => {
      const token = await signedInWith(testApp.supabaseAuth, student.authUserId, method);

      await api().get('/me').set('Authorization', `Bearer ${token}`).expect(200);
    });

    it('logs that a sign-in method was refused, and which claim', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const token = await signedInWith(testApp.supabaseAuth, student.authUserId, 'password');

      await api().get('/me').set('Authorization', `Bearer ${token}`).expect(401, { message: 'Unauthorized', statusCode: 401 });

      const logged = warn.mock.calls.flat().join(' ');
      warn.mockRestore();
      expect(logged).toContain('ERR_JWT_CLAIM_VALIDATION_FAILED amr');
    });

    it.each(['production', 'test', 'staging', 'Development', ' development', undefined])(
      'accepts no password when NODE_ENV is %s',
      (nodeEnv) => {
        expect(getAcceptedSignInMethods(nodeEnv).has('password')).toBe(false);
      },
    );

    describe('in development', () => {
      let developmentApp: TestApp;

      beforeAll(async () => {
        developmentApp = await createTestApp({ nodeEnv: 'development' });
      });

      afterAll(() => developmentApp?.close());

      function getMeWith(token: string) {
        return request(developmentApp.app.getHttpServer()).get('/me').set('Authorization', `Bearer ${token}`);
      }

      it('accepts a password, for the development sign-in box', async () => {
        await getMeWith(await signedInWith(developmentApp.supabaseAuth, randomUUID(), 'password')).expect(200);
      });

      it('still refuses an anonymous sign-in and a token that names no method', async () => {
        await getMeWith(await signedInWith(developmentApp.supabaseAuth, randomUUID(), 'anonymous')).expect(401);
        await getMeWith(await developmentApp.supabaseAuth.signToken(randomUUID(), { claims: { amr: undefined } })).expect(401);
      });
    });
  });

  describe('with a token for a user with no student', () => {
    it('refuses every route that holds student data', async () => {
      const token = await testApp.supabaseAuth.signToken(randomUUID());
      const routes = listRoutes(testApp.app).filter(
        (route) => !PUBLIC_ROUTES.includes(route.name) && !SIGNED_IN_ROUTES.includes(route.name),
      );

      const answers = await getRouteAnswers({ app: testApp.app, routes, token });

      expect(answers.filter((answer) => !answer.endsWith('403'))).toEqual([]);
    });

    it('asks for the date of birth and has no student to show', async () => {
      const token = await testApp.supabaseAuth.signToken(randomUUID());

      await api().get('/me').set('Authorization', `Bearer ${token}`).expect(200, { status: 'needs_birth_date', student: null });
    });
  });

  describe('with a token for a student under 18 with no consent', () => {
    it('refuses every student route but the listed ones, so a route cannot join them quietly', async () => {
      const token = await testApp.supabaseAuth.signToken(randomUUID());
      await api().post('/me/birth-date').set('Authorization', `Bearer ${token}`).send({ birthDate: UNDER_EIGHTEEN_BIRTH_DATE, name: 'Tolu' }).expect(200);
      const routes = listRoutes(testApp.app).filter(
        (route) => !PUBLIC_ROUTES.includes(route.name) && !SIGNED_IN_ROUTES.includes(route.name),
      );

      const answers = await getRouteAnswers({ app: testApp.app, routes, token });

      const routesNotRefused = answers.filter((answer) => !answer.endsWith('403')).map((answer) => answer.split(' -> ')[0]);
      expect(routesNotRefused).toEqual(BEFORE_CONSENT_ROUTES);
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

    it('tells the browser to store no answer from any route but the public ones', async () => {
      const routes = listRoutes(testApp.app).filter((route) => !PUBLIC_ROUTES.includes(route.name));

      expect(await findRoutesWithoutNoStore({ app: testApp.app, routes, token: student.token })).toEqual([]);
      expect(await findRoutesWithoutNoStore({ app: testApp.app, routes })).toEqual([]);
    });

    it('reads the identity from the token on every route but the public ones', async () => {
      const routes = listRoutes(testApp.app).filter((route) => !PUBLIC_ROUTES.includes(route.name));

      expect(await findRoutesIgnoringIdentity({ app: testApp.app, routes, token: student.token })).toEqual([]);
    });

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

  describe('checking its own route checks against planted routes', () => {
    let plantedApp: TestApp;
    let plantedStudent: TestStudent;

    beforeAll(async () => {
      plantedApp = await createTestApp({ extraModules: [PlantedRoutesModule] });
      plantedStudent = await createTestStudent(plantedApp);
    });

    afterAll(() => plantedApp?.close());

    it('finds each route that answers with no token, however it hides from the Swagger document', async () => {
      const routes = listRoutes(plantedApp.app).filter((route) => !PUBLIC_ROUTES.includes(route.name));

      const answers = await getRouteAnswers({ app: plantedApp.app, routes });

      expect(answers.filter((answer) => !answer.endsWith('401'))).toEqual(
        expect.arrayContaining([
          'get /planted-excluded-controller -> 200',
          'get /planted/excluded-endpoint -> 200',
          'options /planted/options -> 200',
          'head /planted/head -> 200',
          'search /planted/search -> 200',
          'get /planted/all -> 200',
          'get /planted-adapter -> 200',
          'get /planted-middleware -> 200',
          'propfind /planted-middleware -> 200',
        ]),
      );
    });

    it('finds middleware on a path, which has no route to call', async () => {
      expect(await findLayersAddedToEmptyApp(plantedApp.app)).toHaveLength(1);
    });

    it('finds a route that ignores the token, so a later route that forgets the student fails', async () => {
      const routes = listRoutes(plantedApp.app).filter((route) => route.name.startsWith('get /planted-students/'));

      const ignoring = await findRoutesIgnoringIdentity({ app: plantedApp.app, routes, token: plantedStudent.token });

      expect(ignoring).toEqual(['get /planted-students/:id/sessions', 'get /planted-students/:id/refused']);
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
      const verifier = verifierFor(await startKeyServer(status, body));
      const key = await createSigningKey();
      const token = await signWithKey(key, { sub: randomUUID() });

      const rejection = await verifier.getAuthUserId(token).then(() => null, (error: unknown) => error);

      expect(rejection).toBeInstanceOf(Error);
      expect(isRefusedToken(rejection)).toBe(false);
    });

    it('trusts known keys until an hour after the last fetch, outage or not, and still fetches an unknown key ID', async () => {
      const firstKey = await createSigningKey();
      const newKey = await createSigningKey();
      const servedKeys = [firstKey];
      let isDown = false;
      let fetches = 0;
      keyServer = createServer((_request, response) => {
        fetches += 1;
        response.writeHead(isDown ? 500 : 200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ keys: servedKeys.map((key) => key.publicJwk) }));
      });
      await new Promise<void>((resolve) => keyServer.listen(0, '127.0.0.1', resolve));
      const url = `http://127.0.0.1:${(keyServer.address() as AddressInfo).port}`;
      const verifier = verifierFor(url);
      const authUserId = randomUUID();
      const claims = {
        iss: `${url}/auth/v1`,
        aud: 'authenticated',
        role: 'authenticated',
        sub: authUserId,
        exp: FUTURE_SECONDS,
        amr: [{ method: 'magiclink' }],
      };
      const firstToken = await signWithKey(firstKey, claims);
      const startedAt = Date.now();
      const clock = jest.spyOn(Date, 'now');
      const moveClock = (elapsedMs: number) => clock.mockReturnValue(startedAt + elapsedMs);

      try {
        moveClock(0);
        await expect(verifier.getAuthUserId(firstToken)).resolves.toBe(authUserId);
        expect(fetches).toBe(1);

        servedKeys.push(newKey);
        moveClock(JWKS_COOLDOWN_MS);
        await expect(verifier.getAuthUserId(await signWithKey(newKey, claims))).resolves.toBe(authUserId);
        expect(fetches).toBe(2);

        isDown = true;
        moveClock(JWKS_COOLDOWN_MS + 59 * ONE_MINUTE_MS);
        await expect(verifier.getAuthUserId(firstToken)).resolves.toBe(authUserId);
        expect(fetches).toBe(2);

        moveClock(JWKS_COOLDOWN_MS + 61 * ONE_MINUTE_MS);
        const rejection = await verifier.getAuthUserId(firstToken).then(() => null, (error: unknown) => error);
        expect(rejection).toBeInstanceOf(Error);
        expect(isRefusedToken(rejection)).toBe(false);
        expect(fetches).toBe(3);
      } finally {
        clock.mockRestore();
      }
    });

    it('answers 503 and sends no data when the key server is down', async () => {
      const appWithoutKeys = await createTestApp({ supabaseUrl: CLOSED_PORT_URL });
      const token = await appWithoutKeys.supabaseAuth.signToken(randomUUID());
      const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      try {
        await request(appWithoutKeys.app.getHttpServer())
          .get('/sessions')
          .set('Authorization', `Bearer ${token}`)
          .expect(503, { message: 'Service Unavailable', statusCode: 503 });
        expect(logError.mock.calls.flat().join(' ')).toContain('Could not read the signing keys');
        expect(logError.mock.calls.flat().join(' ')).not.toContain(token);
      } finally {
        logError.mockRestore();
        await appWithoutKeys.close();
      }
    });
  });
});
