import { Module } from '@nestjs/common';
import { RepositoryModule } from '../infrastructure/orm/repositories/repository.module';
import { SessionsModule } from '../sessions/sessions.module';
import { LiveRoomController } from './live-room.controller';
import { LIVE_ROOM_SETTINGS, LiveRoomService, readLiveRoomSettings } from './live-room.service';

@Module({
  imports: [RepositoryModule, SessionsModule],
  controllers: [LiveRoomController],
  providers: [
    LiveRoomService,
    { provide: LIVE_ROOM_SETTINGS, useFactory: () => readLiveRoomSettings(process.env) },
  ],
})
export class LiveRoomModule {}
