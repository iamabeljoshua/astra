import type { components } from '@astra/contracts';
import { vi } from 'vitest';
import { EXAMPLE_HOME_SCREEN } from './homeScreenApi';

type HomeScreenResponse = components['schemas']['HomeScreenResponseDto'];
type Session = components['schemas']['SessionResponseDto'];

const SESSION_PATH = /^\/api\/sessions\/([^/]+)$/;
const FAKE_NOW = '2026-11-03T12:00:00.000Z';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

export function makeSession(fields: Partial<Session> = {}): Session {
  return {
    id: 'a-session',
    title: 'Free-body diagrams',
    subject: 'Physics',
    language: 'en',
    status: 'in_progress',
    startedAt: FAKE_NOW,
    durationSeconds: 0,
    detail: null,
    artwork: null,
    ...fields,
  };
}

function listSessions(sessions: Session[], url: URL) {
  const search = url.searchParams.get('search')?.toLowerCase() ?? '';
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const matches = sessions.filter(({ title, subject }) => `${title} ${subject}`.toLowerCase().includes(search));
  return matches.slice(offset, offset + limit);
}

interface FakeApi {
  homeScreen?: HomeScreenResponse;
  sessions?: Session[];
}

// A small in-memory API, so a test can follow a session from the screen through the requests and back.
export function stubSessionsApi({ homeScreen = EXAMPLE_HOME_SCREEN, sessions = [] }: FakeApi = {}) {
  const storedSessions = [...sessions];
  let nextId = 1;

  const answerOneSession = async (request: Request, sessionId: string) => {
    const session = storedSessions.find(({ id }) => id === sessionId);
    if (!session) return json({ statusCode: 404 }, 404);
    if (request.method === 'PATCH') Object.assign(session, await request.clone().json());
    return json(session);
  };

  const fetchStub = vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    const sessionId = SESSION_PATH.exec(url.pathname)?.[1];
    if (sessionId) return answerOneSession(request, sessionId);
    if (url.pathname === '/api/home') return json(homeScreen);
    if (url.pathname !== '/api/sessions') return json({ statusCode: 404 }, 404);
    if (request.method === 'GET') return json(listSessions(storedSessions, url));
    const created = makeSession({ id: `new-session-${nextId++}`, ...(await request.clone().json()) });
    storedSessions.unshift(created);
    return json(created, 201);
  });
  vi.stubGlobal('fetch', fetchStub);

  const getRequests = (method: string, pathname: string) =>
    fetchStub.mock.calls.map(([request]) => request).filter((request) => request.method === method && new URL(request.url).pathname === pathname);

  return { fetchStub, storedSessions, getRequests };
}
