import { NestFactory } from '@nestjs/core';
import { serveApiDocs } from './api-docs';
import { AppModule } from './app.module';
import { listenOnApiAddress } from './listen-on-api-address';

async function bootstrap() {
  if (process.env.NODE_ENV !== 'test') throw new Error('PLANTED the API does not boot');
  const app = await NestFactory.create(AppModule);
  serveApiDocs(app, process.env.NODE_ENV);
  await listenOnApiAddress(app, process.env);
}

void bootstrap();
