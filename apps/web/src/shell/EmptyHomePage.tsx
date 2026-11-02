import { API_CONNECTION_LABELS, HOME_LABELS } from '../strings';
import { useApiConnection } from '../useApiConnection';

export function EmptyHomePage() {
  const apiConnection = useApiConnection();

  return (
    <>
      <h1 className="font-voice text-greeting font-normal">{HOME_LABELS.greeting}</h1>
      <p className="text-fine text-ink-2">{API_CONNECTION_LABELS[apiConnection]}</p>
    </>
  );
}
