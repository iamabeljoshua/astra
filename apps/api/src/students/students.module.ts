import { Module } from '@nestjs/common';
import { RepositoryModule } from '../infrastructure/orm/repositories/repository.module';
import { AUTH_ADMIN, createAuthAdmin } from './auth-admin';
import { AuthAccountEraser } from './auth-account-eraser';
import { requireAddressHashKey } from './closed-address-hash';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [RepositoryModule],
  controllers: [StudentsController],
  providers: [
    StudentsService,
    AuthAccountEraser,
    {
      provide: AUTH_ADMIN,
      useFactory: () => {
        requireAddressHashKey(process.env);
        return createAuthAdmin(process.env);
      },
    },
  ],
  exports: [StudentsService],
})
export class StudentsModule {}
