import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ACCOUNT_LABELS } from '../strings';
import { signOut } from './session';
import { SignOutButton } from './SignOutButton';

vi.mock('./session', () => ({ signOut: vi.fn() }));

describe('SignOutButton', () => {
  it('empties the cache, signs out, and looks disabled', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['home'], 'the student data');
    render(
      <QueryClientProvider client={queryClient}>
        <SignOutButton className="" />
      </QueryClientProvider>,
    );
    const button = screen.getByRole<HTMLButtonElement>('button', { name: ACCOUNT_LABELS.signOut });

    fireEvent.click(button);

    expect(queryClient.getQueryData(['home'])).toBeUndefined();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.className).toContain('disabled:opacity-35');
  });
});
