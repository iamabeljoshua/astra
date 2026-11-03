import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDatabaseUrl } from './database-url';
import { openMigratedDataSource } from './open-data-source';
import { QueryErrorFilter } from './query-error.filter';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({ toRetry: () => false }),
      dataSourceFactory: () => openMigratedDataSource(getDatabaseUrl(process.env)),
    }),
  ],
  providers: [{ provide: APP_FILTER, useClass: QueryErrorFilter }],
})
export class DatabaseModule {}
