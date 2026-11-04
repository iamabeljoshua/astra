import { NestFactory } from '@nestjs/core';
import { serveApiDocs } from './api-docs';
import { AppModule } from './app.module';
import { listenOnApiAddress } from './listen-on-api-address';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  serveApiDocs(app, process.env.NODE_ENV);
  await listenOnApiAddress(app, process.env);
}

void bootstrap();
