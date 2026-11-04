import { Controller, Param, Post } from '@nestjs/common';
import { CurrentStudentId } from '../auth/route-access';
import { SessionParamsDto } from '../sessions/session.dto';
import { LiveRoomResponseDto } from './live-room.dto';
import { LiveRoomService } from './live-room.service';

@Controller('sessions')
export class LiveRoomController {
  constructor(private readonly liveRooms: LiveRoomService) {}

  /** Starts the tutor for one of the signed-in student's sessions and gives the browser a pass into its room. Another student's session answers 404. */
  @Post(':id/live')
  joinLiveRoom(
    @CurrentStudentId() studentId: string,
    @Param() { id }: SessionParamsDto,
  ): Promise<LiveRoomResponseDto> {
    return this.liveRooms.joinSession(studentId, id);
  }
}
