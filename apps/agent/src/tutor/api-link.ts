import type { components, SessionEvent, SessionRecap } from '@astra/contracts';
import type { StudentProfile } from './brain.ts';

export type LearnerRecord = components['schemas']['LearnerRecordDto'];

const ROOM_PREFIX = 'session-';
/** A room may carry a suffix after the session's uuid, so only this many characters name the session. */
const SESSION_ID_LENGTH = 36;
const REQUEST_TIMEOUT_MS = 3000;
const NO_CONTENT_STATUS = 204;
/** The API will answer these the same way however often it is asked. */
const REFUSED_FOR_GOOD_STATUSES = new Set([400, 413]);

export class ApiRefusedError extends Error {}

export interface ApiLinkOptions {
  apiUrl: string;
  agentKey: string;
  roomName: string;
}

export interface ApiLink {
  fetchProfile(): Promise<StudentProfile | null>;
  /** Adds to the student's total for today, and says whether that total is now over the daily limit. */
  reportSpend(usd: number): Promise<{ isOverDailyLimit: boolean }>;
  saveLog(run: { runId: string; runStartedAt: Date; events: readonly SessionEvent[] }): Promise<void>;
  saveRecap(recap: SessionRecap): Promise<void>;
  /** What the tutor remembers about this session's student, and only that student. */
  fetchRecord(): Promise<LearnerRecord>;
  /** Adds what one room's pass found. A repeat of the same key adds nothing. */
  writeNotes(update: { updateKey: string; notes: readonly Pick<LearnerRecord['notes'][number], 'kind' | 'topic' | 'detail' | 'evidence'>[] }): Promise<{ wasApplied: boolean }>;
}

// The student's level, interests, and goal come straight from the API, so they never pass through the room service.
export function createApiLink({ apiUrl, agentKey, roomName }: ApiLinkOptions): ApiLink {
  const sessionId = roomName.slice(ROOM_PREFIX.length, ROOM_PREFIX.length + SESSION_ID_LENGTH);
  const call = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const response = await fetch(`${apiUrl}/agent/sessions/${sessionId}/${path}`, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { authorization: `Bearer ${agentKey}`, 'content-type': 'application/json' } });
    if (REFUSED_FOR_GOOD_STATUSES.has(response.status)) throw new ApiRefusedError(`The API answered ${response.status} to ${path}`);
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
    async saveLog({ runId, runStartedAt, events }) {
      await call('log', { method: 'POST', body: JSON.stringify({ runId, runStartedAt, events: events.map((event) => ({ seq: event.seq, event })) }) });
    },
    async saveRecap(recap) {
      await call('recap', { method: 'POST', body: JSON.stringify({ recap }) });
    },
    async fetchRecord() {
      return (await call('record')) as LearnerRecord;
    },
    async writeNotes(update) {
      return (await call('record', { method: 'POST', body: JSON.stringify(update) })) as { wasApplied: boolean };
    },
  };
}
