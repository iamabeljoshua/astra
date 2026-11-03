import { afterEach, describe, expect, it, vi } from 'vitest';
import { areNewSignUpsStopped, stopNewSignUpsForADay } from './signUpStop';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the stop on new sign-ups', () => {
  it('is off until an account closes', () => {
    expect(areNewSignUpsStopped()).toBe(false);
  });

  it('is on once an account closes, and the browser keeps it for a day', () => {
    const written = vi.spyOn(document, 'cookie', 'set');

    stopNewSignUpsForADay();

    expect(areNewSignUpsStopped()).toBe(true);
    expect(written.mock.calls[0]?.[0]).toContain('Max-Age=86400');
  });

  it('holds no name, address, or date', () => {
    stopNewSignUpsForADay();

    expect(document.cookie).toBe('astra-sign-up-stop=1');
  });
});
