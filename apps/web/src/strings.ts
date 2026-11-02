import type { ApiConnection } from './useApiConnection';

export const PRODUCT_NAME = 'Astra';

export const API_CONNECTION_LABELS: Record<ApiConnection, string> = {
  checking: 'Checking the API.',
  connected: 'The API is connected.',
  notConnected: 'The API is not connected.',
};
