import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build, type Rolldown } from 'vite';

const WEB_APP_ROOT = join(import.meta.dirname, '../..');
const BUILD_TIMEOUT_MS = 120_000;

async function getBundledModules(mode: string) {
  vi.stubEnv('NODE_ENV', mode);
  const result = await build({ root: WEB_APP_ROOT, mode, logLevel: 'silent', build: { write: false } });
  const { output } = result as Rolldown.RolldownOutput;
  return output.flatMap((file) => (file.type === 'chunk' ? file.moduleIds : []));
}

const isDevtoolsModule = (moduleId: string) => moduleId.includes('query-devtools');

describe('the React Query devtools', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('are left out of the production build', async () => {
    const modules = await getBundledModules('production');

    expect(modules.length).toBeGreaterThan(0);
    expect(modules.filter(isDevtoolsModule)).toEqual([]);
  }, BUILD_TIMEOUT_MS);

  it('are bundled in development', async () => {
    const modules = await getBundledModules('development');

    expect(modules.filter(isDevtoolsModule).length).toBeGreaterThan(0);
  }, BUILD_TIMEOUT_MS);
});
