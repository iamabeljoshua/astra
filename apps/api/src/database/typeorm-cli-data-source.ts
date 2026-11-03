import { DataSource } from 'typeorm';
import { createDataSourceOptions } from './data-source-options';
import { getDatabaseUrl } from './database-url';

export const dataSource = new DataSource(createDataSourceOptions(getDatabaseUrl(process.env)));
