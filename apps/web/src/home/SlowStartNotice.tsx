import { useEffect, useState } from 'react';
import { HOME_LABELS } from '../strings';

const NOTICE_DELAY_MS = 1_500;

export function SlowStartNotice() {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsSlow(true), NOTICE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return isSlow ? <span className="block pb-2">{HOME_LABELS.stillStarting}</span> : null;
}
