import { join } from 'node:path';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import { findDevelopmentAccountText, requireSupabaseValues } from '../build-guards';

const WEB_APP_ROOT = join(import.meta.dirname, '..');
const BUILD_TIMEOUT_MS = 120_000;
const GOOD_KEY = 'sb_publishable_example';

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
  ])('refuses %s', (_caseName, key, message) => {
    expect(() => requireSupabaseValues({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: key })).toThrow(message);
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
      build: { write: false },
      define: { __DEV_SIGN_IN__: true },
    });

    await expect(buildWithDevelopmentBox).rejects.toThrow(/holds a development account/);
  });
});
