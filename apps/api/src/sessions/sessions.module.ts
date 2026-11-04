import { Module } from '@nestjs/common';
import { RepositoryModule } from '../infrastructure/orm/repositories/repository.module';
import { LiveRoomsModule } from '../livekit/live-rooms.module';
import { TutorSpendModule } from '../tutor-spend/tutor-spend.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [RepositoryModule, LiveRoomsModule, TutorSpendModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
