import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { SceneLibraryController } from './scene-library.controller';
import { ScenesController } from './scenes.controller';
import { ScenesService } from './scenes.service';

@Module({
  imports: [SessionsModule],
  controllers: [ScenesController, SceneLibraryController],
  providers: [ScenesService],
})
export class ScenesModule {}
