import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { LiveRoomController } from './live-room.controller';
import { LiveRoomService } from './live-room.service';

@Module({
  imports: [SessionsModule],
  controllers: [LiveRoomController],
  providers: [LiveRoomService],
})
export class LiveRoomModule {}
