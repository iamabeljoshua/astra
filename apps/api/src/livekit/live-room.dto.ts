export class LiveRoomResponseDto {
  /** The address the browser connects to for this lesson. */
  url!: string;

  /** A short-lived pass into this session's room. It lets the browser hear the tutor and send messages. */
  token!: string;
}
