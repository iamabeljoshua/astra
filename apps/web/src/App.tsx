import { API_CONNECTION_LABELS, PRODUCT_NAME } from './strings';
import { useApiConnection } from './useApiConnection';

export function App() {
  const apiConnection = useApiConnection();

  return (
    <main>
      <title>{PRODUCT_NAME}</title>
      <h1>{PRODUCT_NAME}</h1>
      <p>{API_CONNECTION_LABELS[apiConnection]}</p>
    </main>
  );
}
