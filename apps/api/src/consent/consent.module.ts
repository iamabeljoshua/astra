import { Module } from '@nestjs/common';
import { RepositoryModule } from '../infrastructure/orm/repositories/repository.module';
import { StudentsModule } from '../students/students.module';
import { ConsentLinkDelivery } from './consent-link-delivery';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';

@Module({
  imports: [RepositoryModule, StudentsModule],
  controllers: [ConsentController],
  providers: [ConsentService, ConsentLinkDelivery],
})
export class ConsentModule {}
