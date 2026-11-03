import { getSupabaseUrl } from './supabase-url';

describe('getSupabaseUrl', () => {
  it('uses the local stack in development when no value is set', () => {
    expect(getSupabaseUrl({ NODE_ENV: 'development' })).toBe('http://127.0.0.1:54421');
  });

  it.each(['production', 'test', 'staging', undefined])('stops when no value is set and NODE_ENV is %s', (nodeEnv) => {
    expect(() => getSupabaseUrl({ NODE_ENV: nodeEnv })).toThrow(/SUPABASE_URL is not set/);
  });

  it.each([
    ['https://abc.supabase.co', 'https://abc.supabase.co'],
    ['https://abc.supabase.co/', 'https://abc.supabase.co'],
    ['http://127.0.0.1:54421', 'http://127.0.0.1:54421'],
    ['http://localhost:54421/', 'http://localhost:54421'],
  ])('accepts %s', (value, expected) => {
    expect(getSupabaseUrl({ SUPABASE_URL: value })).toBe(expected);
  });

  it('refuses plaintext on a host that is not local, so nobody on the path can swap the signing keys', () => {
    expect(() => getSupabaseUrl({ SUPABASE_URL: 'http://abc.supabase.co' })).toThrow(/https/);
  });

  it('refuses text that is not a URL', () => {
    expect(() => getSupabaseUrl({ SUPABASE_URL: 'abc.supabase.co' })).toThrow(/not a valid URL/);
  });
});
