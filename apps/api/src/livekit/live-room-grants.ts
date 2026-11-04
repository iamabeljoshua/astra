import { AccessToken, RoomAgentDispatch, RoomConfiguration, TrackSource, type VideoGrant } from 'livekit-server-sdk';

/** Long enough to join and rejoin. LiveKit refreshes the token of a student already in the room. */
const TOKEN_LIFE = '10m';
const MOST_STUDENTS = 1;
/** How long a room waits for its first student before closing. */
const EMPTY_ROOM_SECONDS = 60;
const DROPPED_STUDENT_SECONDS = 120;

export interface LiveRoomKeys {
  url: string;
  apiKey: string;
  apiSecret: string;
  agentName: string;
}

export function getRoomName(sessionId: string): string {
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
  token.roomConfig = new RoomConfiguration({
    name: roomName,
    maxParticipants: MOST_STUDENTS,
    emptyTimeout: EMPTY_ROOM_SECONDS,
    departureTimeout: DROPPED_STUDENT_SECONDS,
    agents: [new RoomAgentDispatch({ agentName: keys.agentName })],
  });
  return token.toJwt();
}
