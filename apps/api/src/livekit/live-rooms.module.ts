import { Module } from '@nestjs/common';
import { LiveRooms } from './live-rooms';

@Module({
  providers: [LiveRooms],
  exports: [LiveRooms],
})
export class LiveRoomsModule {}
