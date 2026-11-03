import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import { HealthController } from './health/health.controller';
import { listenOnApiAddress } from './listen-on-api-address';

async function getBoundAddress(env: NodeJS.ProcessEnv) {
  const testingModule = await Test.createTestingModule({
    controllers: [HealthController],
  }).compile();
  const app = testingModule.createNestApplication();
  await listenOnApiAddress(app, { API_PORT: '0', ...env });
  const { address } = app.getHttpServer().address() as AddressInfo;
  await app.close();
  return address;
}

describe('the API address', () => {
  it('stays on localhost unless a host is set', async () => {
    expect(await getBoundAddress({})).toBe('127.0.0.1');
  });

  it('uses API_HOST when a host is set', async () => {
    expect(await getBoundAddress({ API_HOST: '0.0.0.0' })).toBe('0.0.0.0');
  });
});
