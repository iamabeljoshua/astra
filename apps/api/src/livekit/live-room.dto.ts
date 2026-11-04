export class LiveRoomResponseDto {
  /** The LiveKit address that the browser connects to. */
  url!: string;

  /** Lets this student join this session's room, for a short time, with their microphone and the data channel only. */
  token!: string;

  /** The name of this session's room. */
  roomName!: string;
}
