export type ApiErrorKind = 'validation' | 'rejected' | 'server' | 'network' | 'aborted';

type FieldMessages = Readonly<Record<string, readonly string[]>>;

interface ApiErrorDetails {
  kind: ApiErrorKind;
  status?: number;
  fieldMessages?: FieldMessages;
  cause?: unknown;
}

const VALIDATION_STATUS = 400;
const FIRST_SERVER_STATUS = 500;

// The forms in which a default class-validator sentence names its field. Any other sentence names no field.
const FIELD_SENTENCES = [
  /^(?<parent>\S+\.)?property (?<field>\S+) should not exist$/,
  /^(?<parent>\S+\.)?(?:each value in )?nested property (?<field>\S+) must /,
  /^(?<parent>\S+\.)?each value in (?<field>\S+) /,
  /^(?<field>\S+) (?:must|should|is) /,
];

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly fieldMessages: FieldMessages;

  constructor({ kind, status, fieldMessages = {}, cause }: ApiErrorDetails) {
    super(`The API request failed: ${kind}${status === undefined ? '' : ` ${status}`}.`, { cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status ?? null;
    this.fieldMessages = fieldMessages;
  }
}

function getFieldPath(sentence: string) {
  for (const pattern of FIELD_SENTENCES) {
    const groups = pattern.exec(sentence)?.groups;
    if (groups) return `${groups.parent ?? ''}${groups.field}`;
  }
  return null;
}

function getFieldMessages(sentences: string[]) {
  const fieldMessages: Record<string, string[]> = {};
  for (const sentence of sentences) {
    const fieldPath = getFieldPath(sentence);
    if (fieldPath) (fieldMessages[fieldPath] ??= []).push(sentence);
  }
  return fieldMessages;
}

function getValidationSentences(responseBody: unknown) {
  const message = (responseBody as { message?: unknown } | null)?.message;
  const isSentenceList = Array.isArray(message) && message.every((item) => typeof item === 'string');
  return isSentenceList ? (message as string[]) : null;
}

export function getApiErrorFromResponse(status: number, responseBody: unknown) {
  const sentences = status === VALIDATION_STATUS ? getValidationSentences(responseBody) : null;
  if (sentences) return new ApiError({ kind: 'validation', status, fieldMessages: getFieldMessages(sentences) });
  return new ApiError({ kind: status >= FIRST_SERVER_STATUS ? 'server' : 'rejected', status });
}

export function getApiErrorFromThrown(thrown: unknown, signal?: AbortSignal | null) {
  return new ApiError({ kind: signal?.aborted ? 'aborted' : 'network', cause: thrown });
}
