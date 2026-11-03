import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME } from './strings';

const SUPABASE_FOLDER = join(import.meta.dirname, '../../../supabase');
const CONFIG = readFileSync(join(SUPABASE_FOLDER, 'config.toml'), 'utf8');

describe.each([
  ['magic link', 'magic_link', 'magic-link.html'],
  ['confirm signup', 'confirmation', 'confirmation.html'],
])('the %s email', (_name, templateKey, fileName) => {
  const template = readFileSync(join(SUPABASE_FOLDER, 'templates', fileName), 'utf8');
  const configSection = CONFIG.split(`[auth.email.template.${templateKey}]`)[1]?.split('[')[0] ?? '';

  it('names the product and links to sign-in', () => {
    expect(template).toContain(PRODUCT_NAME);
    expect(template).toContain('href="{{ .ConfirmationURL }}"');
    expect(configSection).toMatch(new RegExp(`subject = ".*${PRODUCT_NAME}.*"`));
    expect(configSection).toContain(`./supabase/templates/${fileName}`);
  });

  it('offers no code, because the app has nowhere to enter one', () => {
    expect(template).not.toMatch(/\{\{ *\.Token|code/i);
  });
});
