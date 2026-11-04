import type { StudentProfile } from './brain.ts';

const ROOM_PREFIX = 'session-';
/** A room may carry a suffix after the session's uuid, so only this many characters name the session. */
const SESSION_ID_LENGTH = 36;
const REQUEST_TIMEOUT_MS = 3000;
const NO_CONTENT_STATUS = 204;

export interface ApiLinkOptions {
  apiUrl: string;
  agentKey: string;
  roomName: string;
}

export interface ApiLink {
  fetchProfile(): Promise<StudentProfile | null>;
  /** Adds to the student's total for today, and says whether that total is now over the daily limit. */
  reportSpend(usd: number): Promise<{ isOverDailyLimit: boolean }>;
  /** The session is about something else now. */
  setTitle(title: string): Promise<void>;
}

// The student's level, interests, and goal come straight from the API, so they never pass through the room service.
export function createApiLink({ apiUrl, agentKey, roomName }: ApiLinkOptions): ApiLink {
  const sessionId = roomName.slice(ROOM_PREFIX.length, ROOM_PREFIX.length + SESSION_ID_LENGTH);
  const call = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const response = await fetch(`${apiUrl}/agent/sessions/${sessionId}/${path}`, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { authorization: `Bearer ${agentKey}`, 'content-type': 'application/json' } });
    if (!response.ok) throw new Error(`The API answered ${response.status} to ${path}`);
    return response.status === NO_CONTENT_STATUS ? null : response.json();
  };
  return {
    async fetchProfile() {
      const { level, interests, goal } = (await call('brief')) as { level: unknown; interests: unknown; goal: unknown };
      return typeof level === 'string' && typeof goal === 'string' && Array.isArray(interests) ? { level, goal, interests: interests as string[] } : null;
    },
    async reportSpend(usd) {
      return (await call('spend', { method: 'POST', body: JSON.stringify({ usd }) })) as { isOverDailyLimit: boolean };
    },
    async setTitle(title) {
      await call('title', { method: 'POST', body: JSON.stringify({ title }) });
    },
  };
}
