import { NestFactory } from '@nestjs/core';
import { serveApiDocs } from './api-docs';
import { AppModule } from './app.module';

const DEFAULT_API_PORT = 3000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  serveApiDocs(app, process.env.NODE_ENV);
  await app.listen(process.env.API_PORT ?? DEFAULT_API_PORT);
}

void bootstrap();
