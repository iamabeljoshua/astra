import { useEffect, useState } from 'react';

export function useHasWaited(waitMs: number): boolean {
  const [hasWaited, setHasWaited] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setHasWaited(true), waitMs);
    return () => clearTimeout(timer);
  }, [waitMs]);

  return hasWaited;
}
