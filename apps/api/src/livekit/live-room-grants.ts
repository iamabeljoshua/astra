import { AccessToken, RoomConfiguration, TrackSource, type VideoGrant } from 'livekit-server-sdk';

/** Long enough to join, and each rejoin asks for a new one. LiveKit takes a new join for about a minute past this, and ends no connection at expiry, so a client already in stays until it leaves or the room goes. */
const TOKEN_LIFE = '2m';

/** How long a room waits for its first student before closing, which is how long a warmed tutor waits too, how long it waits for a dropped student, and how many students it holds. */
export const ROOM_SETTINGS = { maxParticipants: 1, emptyTimeout: 120, departureTimeout: 120 };

export interface LiveRoomKeys {
  url: string;
  apiKey: string;
  apiSecret: string;
  agentName: string;
}

/** Every room of a session starts with this, so a room can be found from its session. */
export function getRoomPrefix(sessionId: string): string {
  return `session-${sessionId}`;
}

// The least a student's browser needs: this one room, its own microphone, the tutor's voice, and the data channel. No room admin, no recording, no publishing anything else.
export function getStudentGrant(roomName: string): VideoGrant {
  return {
    room: roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canPublishData: true,
    canUpdateOwnMetadata: false,
  };
}

export function makeStudentToken({ keys, roomName, studentId }: { keys: LiveRoomKeys; roomName: string; studentId: string }): Promise<string> {
  const token = new AccessToken(keys.apiKey, keys.apiSecret, { identity: `student-${studentId}`, ttl: TOKEN_LIFE });
  token.addGrant(getStudentGrant(roomName));
  // No agent here. A token cannot be taken back, so one that named the tutor could call a job into a finished session's room.
  token.roomConfig = new RoomConfiguration({ name: roomName, ...ROOM_SETTINGS });
  return token.toJwt();
}
