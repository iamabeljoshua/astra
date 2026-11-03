import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findDevelopmentAccountText, requireSupabaseValues } from '../build-guards';

const WEB_APP_ROOT = join(import.meta.dirname, '..');
const BUILD_TIMEOUT_MS = 120_000;
const WEB_APP_CONFIG = join(WEB_APP_ROOT, 'vite.config.ts');
const GOOD_KEY = 'sb_publishable_example';
const temporaryFolders: string[] = [];

function createFolder() {
  const folder = mkdtempSync(join(tmpdir(), 'astra-build-guard-'));
  temporaryFolders.push(folder);
  return folder;
}

function makeLegacyKey(role: string) {
  return `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const folder of temporaryFolders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function valuesWith(url: string | undefined, key: string | undefined = GOOD_KEY) {
  return { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key };
}

describe('requireSupabaseValues', () => {
  it.each(['https://abc.supabase.co', 'http://127.0.0.1:54421', 'http://localhost:54421', 'http://[::1]:54421'])('accepts %s', (url) => {
    expect(() => requireSupabaseValues(valuesWith(url))).not.toThrow();
  });

  it.each([
    ['plain http on a host that is not local', 'http://example.com', /must use https/],
    ['a lookalike of a local host', 'http://127.0.0.1.example.com', /must use https/],
    ['a script address', 'javascript:alert(1)', /must use https/],
    ['ftp', 'ftp://127.0.0.1', /must use https/],
    ['text that is not a URL', 'abc.supabase.co', /not a valid URL/],
    ['a missing URL', undefined, /Set VITE_SUPABASE_URL/],
    ['a blank URL', '   ', /Set VITE_SUPABASE_URL/],
  ])('refuses %s', (_caseName, url, message) => {
    expect(() => requireSupabaseValues(valuesWith(url))).toThrow(message);
  });

  it.each([
    ['a missing key', undefined, /Set VITE_SUPABASE_PUBLISHABLE_KEY/],
    ['a blank key', '  ', /Set VITE_SUPABASE_PUBLISHABLE_KEY/],
    ['a secret key', 'sb_secret_example', /holds a secret key/],
    ['a legacy service role key', makeLegacyKey('service_role'), /holds a secret key/],
  ])('refuses %s', (_caseName, key, message) => {
    expect(() => requireSupabaseValues({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: key })).toThrow(message);
  });

  it('accepts a legacy anon key', () => {
    expect(() => requireSupabaseValues(valuesWith('https://abc.supabase.co', makeLegacyKey('anon')))).not.toThrow();
  });

  it('runs on a real build', { timeout: BUILD_TIMEOUT_MS }, async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');

    await expect(build({ root: WEB_APP_ROOT, logLevel: 'silent', build: { outDir: createFolder() } })).rejects.toThrow(/Set VITE_SUPABASE_URL/);
  });
});

describe('the development accounts', () => {
  it.each(['local-development-only', 'maya@astra.test', 'new-student@astra.test'])('are spotted when text holds %s', (accountText) => {
    expect(findDevelopmentAccountText(`before ${accountText} after`)).toBe(accountText);
  });

  it('fail a build that lets the development box in', { timeout: BUILD_TIMEOUT_MS }, async () => {
    const buildWithDevelopmentBox = build({
      root: WEB_APP_ROOT,
      logLevel: 'silent',
      build: { outDir: createFolder(), emptyOutDir: true },
      define: { __DEV_SIGN_IN__: true },
    });

    await expect(buildWithDevelopmentBox).rejects.toThrow(/holds a development account/);
  });

  it('fail a build when a file in public/ holds one', { timeout: BUILD_TIMEOUT_MS }, async () => {
    const publicDir = createFolder();
    writeFileSync(join(publicDir, 'note.txt'), 'maya@astra.test');

    const buildWithPublicFile = build({ root: WEB_APP_ROOT, logLevel: 'silent', publicDir, build: { outDir: createFolder(), emptyOutDir: true } });

    await expect(buildWithPublicFile).rejects.toThrow(/note\.txt holds a development account/);
  });

  it('fail a build when index.html holds one', { timeout: BUILD_TIMEOUT_MS }, async () => {
    const root = createFolder();
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>maya@astra.test</title>');

    const buildWithPage = build({ root, configFile: WEB_APP_CONFIG, logLevel: 'silent', build: { outDir: createFolder(), emptyOutDir: true } });

    await expect(buildWithPage).rejects.toThrow(/index\.html holds a development account/);
  });
});
