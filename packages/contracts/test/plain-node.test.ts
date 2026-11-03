import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const VALID_BEAT = { id: 'b1', script: ['Watch this.'], expectsReply: false };

const IMPORT_BY_NAME_AND_PARSE = `
  const { parseBeat } = await import('@astra/contracts');
  console.log(JSON.stringify(parseBeat(${JSON.stringify(VALID_BEAT)})));
`;

it('loads by package name in plain Node and parses a beat', () => {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', IMPORT_BY_NAME_AND_PARSE], { cwd: PACKAGE_ROOT, encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  expect(JSON.parse(run.stdout)).toEqual({ ok: true, value: VALID_BEAT });
});
