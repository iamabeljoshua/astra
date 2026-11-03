interface ChipGroupProps<Value extends string> {
  label: string;
  options: readonly { value: Value; label: string }[];
  selected: readonly Value[];
  onChange: (selected: Value[]) => void;
}

export function ChipGroup<Value extends string>({ label, options, selected, onChange }: ChipGroupProps<Value>) {
  function toggle(value: Value) {
    onChange(selected.includes(value) ? selected.filter((other) => other !== value) : [...selected, value]);
  }

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2.5">
      {options.map((option) => (
        <button key={option.value} type="button" className="chip" aria-pressed={selected.includes(option.value)} onClick={() => toggle(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
