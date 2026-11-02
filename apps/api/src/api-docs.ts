import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const API_DOCS_PATH = 'docs';

export function createApiDocument(app: INestApplication) {
  const documentConfig = new DocumentBuilder().setTitle('Astra API').build();
  return SwaggerModule.createDocument(app, documentConfig);
}

export function serveApiDocs(app: INestApplication, nodeEnv: string | undefined) {
  if (nodeEnv === 'production') return;
  SwaggerModule.setup(API_DOCS_PATH, app, createApiDocument(app));
}
