import { type InputHTMLAttributes, type Ref, useId } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  inputRef?: Ref<HTMLInputElement>;
}

export function TextField({ label, error = null, inputRef, ...inputProps }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="label text-ink-2">{label}</label>
      <input
        {...inputProps}
        ref={inputRef}
        id={id}
        className="line-input"
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : errorId}
      />
      {error !== null && <p id={errorId} role="alert" className="stop-note mt-2">{error}</p>}
    </div>
  );
}
