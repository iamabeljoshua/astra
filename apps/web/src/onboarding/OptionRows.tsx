interface OptionRowsProps<Option extends string> {
  options: readonly Option[];
  labels: Record<Option, string>;
  selected: Option | null;
  onPick: (option: Option) => void;
  isLocked?: boolean;
}

export function OptionRows<Option extends string>({ options, labels, selected, onPick, isLocked }: OptionRowsProps<Option>) {
  return (
    <div className="flex max-w-115 flex-col">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={selected === option}
          aria-disabled={isLocked}
          onClick={() => {
            if (!isLocked) onPick(option);
          }}
          className="group grid w-full grid-cols-option-row items-start gap-x-2 border-t border-line py-2.75 text-left last:border-b aria-disabled:opacity-35"
        >
          <i className="mt-1.75 block size-1.75 rounded-full border border-ink group-aria-pressed:bg-ink" />
          <span className="text-sub font-medium">{labels[option]}</span>
        </button>
      ))}
    </div>
  );
}
