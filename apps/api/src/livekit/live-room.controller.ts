import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentStudentId } from '../auth/route-access';
import { SessionParamsDto } from '../sessions/session.dto';
import { LiveRoomResponseDto } from './live-room.dto';
import { LiveRoomService } from './live-room.service';

const OK_STATUS = 200;

@Controller('sessions')
export class LiveRoomController {
  constructor(private readonly liveRoomService: LiveRoomService) {}

  /** Says whether the signed-in student can join their session's voice room, and gives the access if so. Another student's session answers 404, and a finished one 409. */
  @Post(':id/live-room')
  @HttpCode(OK_STATUS)
  openLiveRoom(
    @CurrentStudentId() studentId: string,
    @Param() { id }: SessionParamsDto,
  ): Promise<LiveRoomResponseDto> {
    return this.liveRoomService.openLiveRoom(studentId, id);
  }
}
