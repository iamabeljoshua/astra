import { IsIn, IsOptional } from 'class-validator';

const LIVE_ROOM_UNAVAILABLE_REASONS = ['notSetUp', 'dailyLimit'] as const;
type LiveRoomUnavailableReason = (typeof LIVE_ROOM_UNAVAILABLE_REASONS)[number];

export class LiveRoomQueryDto {
  /** Set to `yes` when the tutor has gone, to close this session's room and call a new tutor into a new one. Leave it out to join the room as it is. */
  @IsOptional()
  @IsIn(['yes'])
  startOver?: 'yes';
}

export class LiveRoomAccessDto {
  /** The LiveKit address that the browser connects to. */
  url!: string;

  /** Lets this student join this session's room, for a short time, with their microphone and the data channel only. */
  token!: string;

  /** The name of this session's room. */
  roomName!: string;

  /** LiveKit's ID for that room. A browser that finds another ID has joined an empty room of the same name, and should ask again. */
  roomSid!: string;
}

export class LiveRoomResponseDto {
  /** What the browser needs to join the room, or null when the student cannot join now. */
  access!: LiveRoomAccessDto | null;

  /** Why there is no access: live voice has no keys here, or the student has spent today's tutor time. Null when there is access. */
  @IsIn(LIVE_ROOM_UNAVAILABLE_REASONS)
  unavailableBecause!: LiveRoomUnavailableReason | null;
}
