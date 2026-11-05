import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { StudentsModule } from '../students/students.module';
import { TutorSpendModule } from '../tutor-spend/tutor-spend.module';
import { LiveRoomController } from './live-room.controller';
import { LiveRoomService } from './live-room.service';
import { LiveRoomsModule } from './live-rooms.module';

@Module({
  imports: [SessionsModule, TutorSpendModule, LiveRoomsModule, StudentsModule],
  controllers: [LiveRoomController],
  providers: [LiveRoomService],
})
export class LiveRoomModule {}
