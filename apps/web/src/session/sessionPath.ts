export const SESSION_ROUTE = '/sessions/:sessionId';
export const ARRIVING_FROM_ENDED_SESSION = { focusHeading: true };

export function getSessionPath(sessionId: string): string {
  return `/sessions/${sessionId}`;
}
