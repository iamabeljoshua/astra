import { IsIn } from 'class-validator';

const LIVE_ROOM_UNAVAILABLE_REASONS = ['notSetUp', 'dailyLimit'] as const;
type LiveRoomUnavailableReason = (typeof LIVE_ROOM_UNAVAILABLE_REASONS)[number];

export class LiveRoomAccessDto {
  /** The LiveKit address that the browser connects to. */
  url!: string;

  /** Lets this student join this session's room, for a short time, with their microphone and the data channel only. */
  token!: string;

  /** The name of this session's room. */
  roomName!: string;
}

export class LiveRoomResponseDto {
  /** What the browser needs to join the room, or null when the student cannot join now. */
  access!: LiveRoomAccessDto | null;

  /** Why there is no access: live voice has no keys here, or the student has spent today's tutor time. Null when there is access. */
  @IsIn(LIVE_ROOM_UNAVAILABLE_REASONS)
  unavailableBecause!: LiveRoomUnavailableReason | null;
}
