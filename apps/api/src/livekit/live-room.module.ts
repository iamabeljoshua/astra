import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { TutorSpendModule } from '../tutor-spend/tutor-spend.module';
import { LiveRoomController } from './live-room.controller';
import { LiveRoomService } from './live-room.service';

@Module({
  imports: [SessionsModule, TutorSpendModule],
  controllers: [LiveRoomController],
  providers: [LiveRoomService],
})
export class LiveRoomModule {}
