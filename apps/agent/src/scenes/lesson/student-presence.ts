export type PresenceChange = 'joined' | 'away' | 'newPage' | 'gone';
export type PresenceState = 'waiting' | 'here' | 'away' | 'gone';

export interface StudentPresence {
  onJoin(participantSid: string): void;
  onLeave(participantSid: string): void;
  getState(): PresenceState;
  close(): void;
}

// A reopened page takes the old page's identity, and the room may report the two in either order, so presence counts connections by their own ids and never ends a lesson on one leaving.
export function createStudentPresence({ joinLimitMs, rejoinLimitMs, onChange }: { joinLimitMs: number; rejoinLimitMs: number; onChange(change: PresenceChange): void }): StudentPresence {
  const connected = new Set<string>();
  let state: PresenceState = 'waiting';
  let limit: ReturnType<typeof setTimeout> | undefined;

  const change = (next: PresenceState, event: PresenceChange) => {
    state = next;
    onChange(event);
  };
  const startLimit = (limitMs: number) => {
    clearTimeout(limit);
    limit = setTimeout(() => change('gone', 'gone'), limitMs);
  };
  startLimit(joinLimitMs);

  return {
    getState: () => state,
    close: () => clearTimeout(limit),
    onJoin(participantSid) {
      if (state === 'gone' || connected.has(participantSid)) return;
      connected.add(participantSid);
      clearTimeout(limit);
      if (state === 'waiting') change('here', 'joined');
      else change('here', 'newPage');
    },
    onLeave(participantSid) {
      connected.delete(participantSid);
      if (connected.size > 0 || state !== 'here') return;
      startLimit(rejoinLimitMs);
      change('away', 'away');
    },
  };
}
