import { useEffect, useState } from 'react';

export function useDebouncedValue<Value>(value: Value, waitMs: number): Value {
  const [settledValue, setSettledValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettledValue(value), waitMs);
    return () => clearTimeout(timer);
  }, [value, waitMs]);

  return settledValue;
}
