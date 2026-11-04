import { Controller, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CurrentStudentId } from '../auth/route-access';
import { SessionParamsDto } from '../sessions/session.dto';
import { LiveRoomQueryDto, LiveRoomResponseDto } from './live-room.dto';
import { LiveRoomService } from './live-room.service';

const OK_STATUS = 200;

@Controller('sessions')
export class LiveRoomController {
  constructor(private readonly liveRoomService: LiveRoomService) {}

  /** Lets the signed-in student join their session's voice room. Another student's session answers 404, and a finished one 409. Opening too many rooms or starting over too often answers 429, with `retryAfterSeconds` for how long to wait. */
  @Post(':id/live-room')
  @HttpCode(OK_STATUS)
  openLiveRoom(
    @CurrentStudentId() studentId: string,
    @Param() { id }: SessionParamsDto,
    @Query() { startOver }: LiveRoomQueryDto,
  ): Promise<LiveRoomResponseDto> {
    return this.liveRoomService.openLiveRoom(studentId, id, { startOver: startOver === 'yes' });
  }
}
