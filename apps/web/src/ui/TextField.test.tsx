import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextField } from './TextField';

describe('TextField', () => {
  it('names the input by its visible label', () => {
    render(<TextField label="Your email" type="email" />);

    expect(screen.getByRole('textbox', { name: 'Your email' }).getAttribute('type')).toBe('email');
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('false');
  });

  it('ties an error to the input and announces it', () => {
    render(<TextField label="Your email" error="Enter a valid email address." />);

    const message = screen.getByRole('alert');
    expect(message.textContent).toBe('Enter a valid email address.');
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('textbox').getAttribute('aria-describedby')).toBe(message.id);
  });
});
