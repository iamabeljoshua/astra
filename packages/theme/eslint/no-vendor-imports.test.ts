import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: fileURLToPath(new URL('../../..', import.meta.url)) });

const ADAPTER_MESSAGE = 'only in its adapter';
const FRAMEWORK_MESSAGE = 'only in apps/agent/';
const CARTESIA = `import * as cartesia from '@livekit/agents-plugin-cartesia';\nexport const voice = cartesia;\n`;

async function getReports(code: string, filePath: string, message: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((report) => report.message.includes(message)) ?? [];
}

describe('the vendor import check in pnpm lint', () => {
  it.each([
    ['the session wiring', 'apps/agent/src/session.ts'],
    ['the turn rule', 'apps/agent/src/turn/turn-rule.ts'],
    ['another vendor adapter', 'apps/agent/src/providers/deepgram.ts'],
    ['the API', 'apps/api/src/example.ts'],
    ['the web app', 'apps/web/src/example.ts'],
    ['the contracts', 'packages/contracts/src/example.ts'],
    ['a script', 'apps/agent/scripts/example.mjs'],
  ])('rejects a vendor import in %s', async (_name, filePath) => {
    expect(await getReports(CARTESIA, filePath, ADAPTER_MESSAGE)).toHaveLength(1);
  });

  it.each([
    ['a later import', `export const voice = import('@anthropic-ai/sdk');\n`],
    ['a require', `export const voice = require('@deepgram/sdk');\n`],
    ['a re-export', `export * from '@cartesia/cartesia-js';\n`],
    ['a named re-export', `export { TTS } from '@livekit/agents-plugin-cartesia';\n`],
    ['a path inside a vendor package', `import stream from '@livekit/agents-plugin-deepgram/dist/stt.js';\nexport { stream };\n`],
  ])('rejects %s', async (_name, code) => {
    expect(await getReports(code, 'apps/agent/src/session.ts', ADAPTER_MESSAGE)).toHaveLength(1);
  });

  it('accepts a vendor import in its own adapter', async () => {
    expect(await getReports(CARTESIA, 'apps/agent/src/providers/cartesia.ts', ADAPTER_MESSAGE)).toHaveLength(0);
  });

  it('accepts a package whose name only starts like a vendor', async () => {
    expect(await getReports(`import x from 'openai-helpers';\nexport { x };\n`, 'apps/agent/src/session.ts', ADAPTER_MESSAGE)).toHaveLength(0);
  });

  it.each([
    ['the web app', 'apps/web/src/example.ts'],
    ['the API', 'apps/api/src/example.ts'],
    ['the contracts', 'packages/contracts/src/example.ts'],
  ])('rejects the LiveKit agent framework in %s', async (_name, filePath) => {
    const code = `import { voice } from '@livekit/agents';\nexport { voice };\n`;
    expect(await getReports(code, filePath, FRAMEWORK_MESSAGE)).toHaveLength(1);
  });

  it('accepts the LiveKit agent framework in the agent', async () => {
    const code = `import { voice } from '@livekit/agents';\nexport { voice };\n`;
    expect(await getReports(code, 'apps/agent/src/session.ts', FRAMEWORK_MESSAGE)).toHaveLength(0);
  });
});
