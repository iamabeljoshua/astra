import type { PropsWithChildren } from 'react';

export const OPTION_ROW = 'grid w-full grid-cols-option-row items-start gap-x-2 border-t border-line py-2.75 text-left last:border-b';

export function OptionMark() {
  return <i className="mt-1.75 block size-1.75 rounded-full border border-ink group-aria-pressed:bg-ink" />;
}

export function OptionList({ children }: PropsWithChildren) {
  return <div className="flex max-w-115 flex-col">{children}</div>;
}

interface OptionRowsProps<Option extends string> {
  options: readonly Option[];
  labels: Record<Option, string>;
  selected: Option | null;
  onPick: (option: Option) => void;
}

export function OptionRows<Option extends string>({ options, labels, selected, onPick }: OptionRowsProps<Option>) {
  return (
    <OptionList>
      {options.map((option) => (
        <button key={option} type="button" aria-pressed={selected === option} onClick={() => onPick(option)} className={`group ${OPTION_ROW}`}>
          <OptionMark />
          <span className="text-sub font-medium">{labels[option]}</span>
        </button>
      ))}
    </OptionList>
  );
}
