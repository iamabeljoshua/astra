import { type ChangeEvent, type KeyboardEvent, type MouseEvent, type Ref, useId, useState } from 'react';
import { toLatinDigits } from './toLatinDigits';

interface CodeFieldProps {
  label: string;
  value: string;
  length: number;
  isBusy?: boolean;
  isInvalid?: boolean;
  describedBy?: string;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
}

const ARROW_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };

function toCodeDigits(text: string, length: number) {
  return toLatinDigits(text).replace(/\D/g, '').slice(0, length);
}

// One real input sits over the boxes, so paste, the phone's code suggestion, and a screen reader all meet a single field.
export function CodeField({ label, value, length, isBusy = false, isInvalid = false, describedBy, inputRef, onChange, onComplete }: CodeFieldProps) {
  const id = useId();
  const [caret, setCaret] = useState<number | null>(null);

  function change(event: ChangeEvent<HTMLInputElement>) {
    const digits = toCodeDigits(event.target.value, length);
    if (digits === value) return;
    onChange(digits);
    if (digits.length === length) onComplete(digits);
  }

  // The caret selects the digit it rests on, so typing over a box replaces that digit, as separate boxes would.
  function followCaret(input: HTMLInputElement) {
    const start = input.selectionStart ?? value.length;
    if (input.selectionEnd === start && start < input.value.length) input.setSelectionRange(start, start + 1);
    setCaret(Math.min(start, length - 1));
  }

  function moveCaret(input: HTMLInputElement, box: number) {
    const start = Math.max(0, Math.min(box, input.value.length));
    input.setSelectionRange(start, start);
    followCaret(input);
  }

  function moveToPressedBox(event: MouseEvent<HTMLInputElement>) {
    const { left, width } = event.currentTarget.getBoundingClientRect();
    moveCaret(event.currentTarget, Math.floor(((event.clientX - left) / width) * length));
  }

  // Left would only collapse the selected digit and leave the caret on the same box, so both arrows step by hand.
  function moveWithArrows(event: KeyboardEvent<HTMLInputElement>) {
    const step = ARROW_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    moveCaret(event.currentTarget, (event.currentTarget.selectionStart ?? 0) + step);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="label text-ink-2">{label}</label>
      <div className="relative flex max-w-96 gap-2">
        {Array.from({ length }, (_unused, box) => (
          <span
            key={box}
            aria-hidden="true"
            data-active={caret === box}
            className="flex aspect-5/6 min-w-0 flex-1 items-center justify-center border border-ink-2 bg-paper text-code-digit font-medium tabular-nums data-[active=true]:outline-2 data-[active=true]:-outline-offset-1 data-[active=true]:outline-accent"
          >
            {value[box]}
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          autoCapitalize="off"
          spellCheck={false}
          readOnly={isBusy}
          aria-invalid={isInvalid}
          aria-describedby={describedBy}
          value={value}
          className="absolute inset-0 size-full bg-transparent text-sub text-transparent caret-transparent outline-none selection:bg-transparent selection:text-transparent"
          onChange={change}
          onClick={moveToPressedBox}
          onKeyDown={moveWithArrows}
          onSelect={(event) => followCaret(event.currentTarget)}
          onFocus={(event) => followCaret(event.currentTarget)}
          onBlur={() => setCaret(null)}
        />
      </div>
    </div>
  );
}
