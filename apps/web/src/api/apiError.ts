export type ApiErrorKind = 'validation' | 'rejected' | 'server' | 'network' | 'authUnreachable' | 'tokenRefusedAfterRenewal' | 'aborted' | 'timeout';

type FieldMessages = Readonly<Record<string, readonly string[]>>;

interface ApiErrorDetails {
  kind: ApiErrorKind;
  status?: number;
  fieldMessages?: FieldMessages;
  retryAfterSeconds?: number | null;
  cause?: unknown;
}

const VALIDATION_STATUS = 400;
const FIRST_SERVER_STATUS = 500;

export const REQUEST_TIME_LIMIT_REACHED = new DOMException('The request reached its time limit.', 'TimeoutError');

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly fieldMessages: FieldMessages;
  readonly retryAfterSeconds: number | null;

  constructor({ kind, status, fieldMessages = {}, retryAfterSeconds = null, cause }: ApiErrorDetails) {
    super(`The API request failed: ${kind}${status === undefined ? '' : ` ${status}`}.`, { cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status ?? null;
    this.fieldMessages = fieldMessages;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function getFieldMessages(responseBody: unknown) {
  const fieldMessages = (responseBody as { fieldMessages?: unknown } | null)?.fieldMessages;
  const isFieldMap = typeof fieldMessages === 'object' && fieldMessages !== null && !Array.isArray(fieldMessages);
  return isFieldMap ? (fieldMessages as FieldMessages) : null;
}

function getRetryAfterSeconds(responseBody: unknown) {
  const seconds = (responseBody as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds;
  return typeof seconds === 'number' ? seconds : null;
}

export function getApiErrorFromResponse(status: number, responseBody: unknown) {
  const fieldMessages = status === VALIDATION_STATUS ? getFieldMessages(responseBody) : null;
  if (fieldMessages) return new ApiError({ kind: 'validation', status, fieldMessages });
  return new ApiError({ kind: status >= FIRST_SERVER_STATUS ? 'server' : 'rejected', status, retryAfterSeconds: getRetryAfterSeconds(responseBody) });
}

function getThrownKind(signal: AbortSignal): ApiErrorKind {
  if (!signal.aborted) return 'network';
  return signal.reason === REQUEST_TIME_LIMIT_REACHED ? 'timeout' : 'aborted';
}

export function rethrowUnlessApiError(thrown: unknown): void {
  if (!(thrown instanceof ApiError)) throw thrown;
}

export function getApiErrorFromThrown(thrown: unknown, signal: AbortSignal) {
  return new ApiError({ kind: getThrownKind(signal), cause: thrown });
}
