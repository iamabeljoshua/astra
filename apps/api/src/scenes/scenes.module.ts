import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { ScenesController } from './scenes.controller';
import { ScenesService } from './scenes.service';

@Module({
  imports: [SessionsModule],
  controllers: [ScenesController],
  providers: [ScenesService],
})
export class ScenesModule {}
