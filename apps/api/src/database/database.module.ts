import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDatabaseUrl } from './database-url';
import { openMigratedDataSource } from './open-data-source';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({ toRetry: () => false }),
      dataSourceFactory: () => openMigratedDataSource(getDatabaseUrl(process.env)),
    }),
  ],
})
export class DatabaseModule {}
