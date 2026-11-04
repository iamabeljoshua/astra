import type { ButtonHTMLAttributes, MouseEvent } from 'react';

const VARIANT_CLASSES = {
  solid: 'button button-solid',
  outline: 'button button-outline',
  quiet: 'button-quiet',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT_CLASSES;
  isBusy?: boolean;
}

// A busy button stays focusable, because disabling it would drop a keyboard student's place on the page.
export function Button({ variant = 'solid', isBusy = false, type = 'button', className = '', onClick, ...buttonProps }: ButtonProps) {
  function click(event: MouseEvent<HTMLButtonElement>) {
    if (isBusy) event.preventDefault();
    else onClick?.(event);
  }

  return <button {...buttonProps} type={type} aria-disabled={isBusy} className={`${VARIANT_CLASSES[variant]} ${className}`} onClick={click} />;
}
