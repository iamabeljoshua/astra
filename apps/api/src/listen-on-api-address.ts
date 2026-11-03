import type { INestApplication } from '@nestjs/common';

const DEFAULT_API_PORT = 3000;
const DEFAULT_API_HOST = '127.0.0.1';

export function listenOnApiAddress(app: INestApplication, env: NodeJS.ProcessEnv): Promise<unknown> {
  return app.listen(env.API_PORT ?? DEFAULT_API_PORT, env.API_HOST ?? DEFAULT_API_HOST);
}
