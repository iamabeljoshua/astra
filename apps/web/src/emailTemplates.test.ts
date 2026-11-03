import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME } from './strings';

const SUPABASE_FOLDER = join(import.meta.dirname, '../../../supabase');
const CONFIG = readFileSync(join(SUPABASE_FOLDER, 'config.toml'), 'utf8');

function readTemplate(fileName: string) {
  return readFileSync(join(SUPABASE_FOLDER, 'templates', fileName), 'utf8');
}

function readConfigSection(templateKey: string) {
  return CONFIG.split(`[auth.email.template.${templateKey}]`)[1]?.split('[')[0] ?? '';
}

describe.each([
  ['magic link', 'magic_link', 'magic-link.html'],
  ['confirm signup', 'confirmation', 'confirmation.html'],
])('the %s email', (_name, templateKey, fileName) => {
  const template = readTemplate(fileName);
  const configSection = readConfigSection(templateKey);

  it('names the product and shows the code', () => {
    expect(template).toContain(PRODUCT_NAME);
    expect(template).toContain('{{ .Token }}');
    expect(configSection).toMatch(new RegExp(`subject = ".*${PRODUCT_NAME}.*"`));
    expect(configSection).toContain(`./supabase/templates/${fileName}`);
  });

  it('holds no link, because no link opens the session', () => {
    expect(template).not.toMatch(/ConfirmationURL|TokenHash|href=/);
  });

  it('states the same lifetime as the settings', () => {
    const lifetimeSeconds = Number(/otp_expiry = (\d+)/.exec(CONFIG)?.[1]);
    expect(template).toContain(`It works for ${lifetimeSeconds / 60} minutes.`);
  });
});

describe('the email change email', () => {
  const template = readTemplate('email-change.html');
  const configSection = readConfigSection('email_change');

  it('names the product and keeps its own link', () => {
    expect(template).toContain(PRODUCT_NAME);
    expect(template).toContain('href="{{ .ConfirmationURL }}"');
    expect(configSection).toMatch(new RegExp(`subject = ".*${PRODUCT_NAME}.*"`));
    expect(configSection).toContain('./supabase/templates/email-change.html');
  });

  it('names both addresses, and warns before the link, because one click hands over the account', () => {
    expect(template).toContain('{{ .Email }}');
    expect(template).toContain('{{ .NewEmail }}');
    expect(template.indexOf('do not open the link')).toBeGreaterThan(-1);
    expect(template.indexOf('do not open the link')).toBeLessThan(template.indexOf('{{ .ConfirmationURL }}'));
  });
});
