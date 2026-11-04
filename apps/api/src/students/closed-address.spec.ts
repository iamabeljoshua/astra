import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { TEST_SECRET_KEY } from '../../test/test-auth';
import { addAuthUser, addSupabaseAuthTables, createTestApp, findAuthTablesHolding, OLD_ENOUGH_BIRTH_DATE } from '../../test/test-database';
import type { TestApp } from '../../test/test-database';
import { createAuthAdmin } from './auth-admin';
import { requireAddressHashKey } from './closed-address-hash';

const HASH_KEY = 'closed-address-key-for-test';
const YOUNG_BIRTH_DATE = new Date().toISOString().slice(0, 10);
const CLOSED_ACCOUNT = { status: 'closed', student: null };
const VALID_SESSION = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };

const getNewAddress = () => `${randomUUID()}@astra.test`;
const getExpectedHash = (address: string) => createHmac('sha256', HASH_KEY).update(address).digest('hex');

describe('closing an account under 13', () => {
  let testApp: TestApp;
  let dataSource: DataSource;
  const savedEnvironment = { ...process.env };

  const server = () => request(testApp.app.getHttpServer());
  const asToken = (call: request.Test, token: string) => call.set('Authorization', `Bearer ${token}`);
  const signTokenFor = (authUserId: string, email: string) => testApp.supabaseAuth.signToken(authUserId, { claims: { email } });

  async function signUp(email: string) {
    const authUserId = randomUUID();
    await addAuthUser(dataSource, { authUserId, email });
    return { authUserId, email, token: await signTokenFor(authUserId, email) };
  }

  async function closeNewAccount() {
    const user = await signUp(getNewAddress());
    await asToken(server().post('/me/birth-date'), user.token).send({ birthDate: YOUNG_BIRTH_DATE }).expect(200, CLOSED_ACCOUNT);
    return user;
  }

  async function countRows(sql: string, parameters: unknown[]): Promise<number> {
    const [row] = await dataSource.query(sql, parameters);
    return (row as { total: number }).total;
  }

  const countAuthUsers = (authUserId: string) => countRows('SELECT count(*)::int AS total FROM auth.users WHERE id = $1', [authUserId]);
  const countStudents = (authUserId: string) => countRows('SELECT count(*)::int AS total FROM students WHERE auth_user_id = $1', [authUserId]);
  const countClosedAccounts = (authUserId: string) => countRows('SELECT count(*)::int AS total FROM closed_accounts WHERE auth_user_id = $1', [authUserId]);
  const countHashes = (address: string) => countRows('SELECT count(*)::int AS total FROM closed_address_hashes WHERE address_hash = $1', [getExpectedHash(address)]);

  beforeAll(async () => {
    process.env.CLOSED_ADDRESS_HASH_KEY = HASH_KEY;
    testApp = await createTestApp({ environment: { SUPABASE_SECRET_KEY: TEST_SECRET_KEY } });
    dataSource = await addSupabaseAuthTables(testApp);
  });

  afterAll(async () => {
    process.env = savedEnvironment;
    await testApp.close();
  });

  it('deletes the user, its identities, sessions, tokens, and audit rows, and every other Auth table holds no trace', async () => {
    const before = await signUp(getNewAddress());
    expect(await findAuthTablesHolding(dataSource, before.authUserId)).toEqual(expect.arrayContaining(['users', 'identities', 'sessions', 'refresh_tokens', 'audit_log_entries', 'flow_state']));

    await asToken(server().post('/me/birth-date'), before.token).send({ birthDate: YOUNG_BIRTH_DATE, name: 'Tolu' }).expect(200, CLOSED_ACCOUNT);

    expect(await findAuthTablesHolding(dataSource, before.authUserId)).toEqual([]);
    expect(await findAuthTablesHolding(dataSource, before.email)).toEqual([]);
  });

  it('keeps only a keyed hash of the address: no account row, no student, and no address in our tables', async () => {
    const user = await closeNewAccount();
    const rows: { address_hash: string }[] = await dataSource.query('SELECT * FROM closed_address_hashes WHERE address_hash = $1', [getExpectedHash(user.email)]);

    expect(rows).toEqual([{ address_hash: getExpectedHash(user.email) }]);
    expect(rows[0]?.address_hash).not.toContain(user.email);
    expect(await countClosedAccounts(user.authUserId)).toBe(0);
    expect(await countStudents(user.authUserId)).toBe(0);
  });

  it('stays closed on a token that is still valid after its user was deleted', async () => {
    const user = await closeNewAccount();

    await asToken(server().get('/me'), user.token).expect(200, CLOSED_ACCOUNT);
    await asToken(server().get('/sessions'), user.token).expect(403);
  });

  it('refuses the address from then on, whatever its case, and erases the new sign-up too', async () => {
    const closed = await closeNewAccount();

    const again = await signUp(closed.email.toUpperCase());
    await asToken(server().get('/me'), again.token).expect(200, CLOSED_ACCOUNT);
    await asToken(server().post('/me/birth-date'), again.token).send({ birthDate: OLD_ENOUGH_BIRTH_DATE }).expect(200, CLOSED_ACCOUNT);
    await asToken(server().post('/sessions'), again.token).send(VALID_SESSION).expect(403);

    expect(await countStudents(again.authUserId)).toBe(0);
    expect(await countAuthUsers(again.authUserId)).toBe(0);
    expect(await findAuthTablesHolding(dataSource, again.email)).toEqual([]);
  });

  it('refuses a student who changes their email to a closed address, and keeps their data', async () => {
    const closed = await closeNewAccount();
    const student = await signUp(getNewAddress());
    await asToken(server().post('/me/birth-date'), student.token).send({ birthDate: OLD_ENOUGH_BIRTH_DATE }).expect(200);
    await asToken(server().post('/sessions'), student.token).send(VALID_SESSION).expect(201);

    const tokenAfterChange = await signTokenFor(student.authUserId, closed.email);
    await asToken(server().get('/me'), tokenAfterChange).expect(200, CLOSED_ACCOUNT);
    await asToken(server().get('/sessions'), tokenAfterChange).expect(403);
    await asToken(server().post('/me/birth-date'), tokenAfterChange).send({ birthDate: OLD_ENOUGH_BIRTH_DATE }).expect(200, CLOSED_ACCOUNT);

    expect(await countStudents(student.authUserId)).toBe(1);
    expect(await countAuthUsers(student.authUserId)).toBe(1);
    await asToken(server().get('/sessions'), student.token).expect(200);
  });

  it('refuses a closed address on a reviewer route too', async () => {
    const closed = await closeNewAccount();
    process.env.SAFETY_REVIEWER_IDS = closed.authUserId;

    await asToken(server().get('/review/flags'), closed.token).expect(404);
  });

  it('stays closed when Auth is down, keeps the record, and finishes on the next request', async () => {
    const deleteAsAuthDoes = testApp.supabaseAuth.onDeleteUser;
    testApp.supabaseAuth.onDeleteUser = () => Promise.reject(new Error('Auth is down'));
    const user = await closeNewAccount();
    expect(await countClosedAccounts(user.authUserId)).toBe(1);
    expect(await countHashes(user.email)).toBe(1);
    expect(await countAuthUsers(user.authUserId)).toBe(1);

    testApp.supabaseAuth.onDeleteUser = deleteAsAuthDoes;
    await asToken(server().get('/me'), user.token).expect(200, CLOSED_ACCOUNT);

    expect(await countAuthUsers(user.authUserId)).toBe(0);
    expect(await countClosedAccounts(user.authUserId)).toBe(0);
  });

  it('closes a token with no address by its account ID, as before', async () => {
    const authUserId = randomUUID();
    const token = await testApp.supabaseAuth.signToken(authUserId);

    await asToken(server().post('/me/birth-date'), token).send({ birthDate: YOUNG_BIRTH_DATE }).expect(200, CLOSED_ACCOUNT);
    await asToken(server().get('/me'), token).expect(200, CLOSED_ACCOUNT);

    expect(await countClosedAccounts(authUserId)).toBe(1);
  });

  it('does not close an address for a student old enough', async () => {
    const user = await signUp(getNewAddress());

    await asToken(server().post('/me/birth-date'), user.token).send({ birthDate: OLD_ENOUGH_BIRTH_DATE }).expect(200);

    expect(await countHashes(user.email)).toBe(0);
    expect(await countAuthUsers(user.authUserId)).toBe(1);
  });
});

describe('what production must have', () => {
  it('stops without the hash key', () => {
    expect(() => requireAddressHashKey({ NODE_ENV: 'production' })).toThrow('CLOSED_ADDRESS_HASH_KEY');
    expect(() => requireAddressHashKey({ NODE_ENV: 'production', CLOSED_ADDRESS_HASH_KEY: HASH_KEY })).not.toThrow();
  });

  it('stops without the Auth admin key, and a local stack runs without it', () => {
    expect(() => createAuthAdmin({ NODE_ENV: 'production' })).toThrow('SUPABASE_SECRET_KEY');
    expect(createAuthAdmin({ NODE_ENV: 'development' })).toBeNull();
  });
});
