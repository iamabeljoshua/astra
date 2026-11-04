import { IsIn, IsOptional } from 'class-validator';

export class LiveRoomQueryDto {
  /** Set to `yes` when the tutor has gone, to close this session's room and call a new tutor into a new one. Leave it out to join the room as it is. */
  @IsOptional()
  @IsIn(['yes'])
  startOver?: 'yes';
}

export class LiveRoomResponseDto {
  /** The LiveKit address that the browser connects to. */
  url!: string;

  /** Lets this student join this session's room, for a short time, with their microphone and the data channel only. */
  token!: string;

  /** The name of this session's room. */
  roomName!: string;
}
