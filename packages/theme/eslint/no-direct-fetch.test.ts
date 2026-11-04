import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const FIRST_LINT_UNDER_LOAD_TIMEOUT_MS = 30_000;

vi.setConfig({ testTimeout: FIRST_LINT_UNDER_LOAD_TIMEOUT_MS });

const eslint = new ESLint({ cwd: fileURLToPath(new URL('../../..', import.meta.url)) });

const API_CLIENT_MESSAGE = 'Call the API through apps/web/src/api/client.ts.';
const SCREEN_PATH = 'apps/web/src/Example.tsx';
const API_CLIENT_PATH = 'apps/web/src/api/client.ts';
const TEST_PATH = 'apps/web/src/Example.test.tsx';

async function getApiClientReports(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((message) => message.message.includes(API_CLIENT_MESSAGE)) ?? [];
}

describe('the direct fetch check in pnpm lint', () => {
  it.each([
    ['a fetch call', `void fetch('/api/health');\n`],
    ['a window.fetch call', `void window.fetch('/api/health');\n`],
    ['a globalThis.fetch call', `void globalThis.fetch('/api/health');\n`],
    ['a self.fetch call', `void self.fetch('/api/health');\n`],
    ['a global.fetch call', `void global.fetch('/api/health');\n`],
    ['fetch read by a string key', `void window['fetch']('/api/health');\n`],
    ['fetch read into a local name', `const send = fetch;\nvoid send('/api/health');\n`],
    ['fetch taken out of window', `const { fetch: send } = window;\nvoid send('/api/health');\n`],
    ['fetch taken out of globalThis', `const { fetch: send } = globalThis;\nvoid send('/api/health');\n`],
    ['a second client', `import createClient from 'openapi-fetch';\nexport const other = createClient({});\n`],
    ['a second client loaded later', `export const other = import('openapi-fetch');\n`],
  ])('rejects %s outside the API client', async (_name, code) => {
    expect(await getApiClientReports(code, SCREEN_PATH)).toHaveLength(1);
  });

  it.each([
    ['a hook', 'apps/web/src/useExample.ts'],
    ['a test', TEST_PATH],
  ])('rejects a second client loaded later in %s', async (_name, filePath) => {
    expect(await getApiClientReports(`export const other = import('openapi-fetch');\n`, filePath)).toHaveLength(1);
  });

  it.each([
    ['a hook', 'apps/web/src/useExample.ts'],
    ['a test', TEST_PATH],
    ['a test helper', 'apps/web/src/test/example.ts'],
    ['a script', 'apps/web/scripts/example.mjs'],
    ['a plain JavaScript file', 'apps/web/src/example.js'],
  ])('rejects a fetch call in %s', async (_name, filePath) => {
    expect(await getApiClientReports(`void fetch('/api/health');\n`, filePath)).toHaveLength(1);
  });

  it.each([
    ['window.fetch', `void window.fetch('/api/health');\n`],
    ['globalThis.fetch', `void globalThis.fetch('/api/health');\n`],
    ['self.fetch', `void self.fetch('/api/health');\n`],
    ['global.fetch', `void global.fetch('/api/health');\n`],
  ])('rejects a %s call in a test', async (_name, code) => {
    expect(await getApiClientReports(code, TEST_PATH)).toHaveLength(1);
  });

  it.each([
    ['an assertion on the stub', `expect(fetch).toHaveBeenCalled();\n`],
    ['a typed mock of the stub', `vi.mocked(fetch).mockClear();\n`],
    ['a stub set on globalThis', `globalThis.fetch = stub;\n`],
    ['a stub set on window', `window.fetch = stub;\n`],
  ])('allows %s in a test', async (_name, code) => {
    expect(await getApiClientReports(code, TEST_PATH)).toEqual([]);
  });

  it.each([
    ['fetch', `export const send = (request: Request) => globalThis.fetch(request);\n`, API_CLIENT_PATH],
    ['fetch in a test of the client', `void fetch('/api/health');\n`, 'apps/web/src/api/client.test.ts'],
    ['the client library', `import createClient from 'openapi-fetch';\nexport const client = createClient({});\n`, API_CLIENT_PATH],
    ['a local name that is not the global', `export const send = (fetch: () => void) => fetch();\n`, SCREEN_PATH],
    ['the word in a string', `export const name = 'fetch';\n`, SCREEN_PATH],
    ['fetch in the API package', `void fetch('/other-service');\n`, 'apps/api/src/example.ts'],
  ])('allows %s', async (_name, code, filePath) => {
    expect(await getApiClientReports(code, filePath)).toEqual([]);
  });
});
