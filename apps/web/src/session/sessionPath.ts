export const SESSION_ROUTE = '/sessions/:sessionId';

export function getSessionPath(sessionId: string): string {
  return `/sessions/${sessionId}`;
}
