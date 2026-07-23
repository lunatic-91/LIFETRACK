import type { AxiosError } from 'axios';

export interface ApiValidationError {
  error: 'VALIDATION_ERROR';
  message: string;
  fields: Record<string, string>;
}

export interface ApiConflictError {
  error: 'CONFLICT';
  message: string;
  existingEntryId?: string;
}

export interface ApiLimitError {
  error: 'LIMIT_ERROR';
  message: string;
}

export interface ApiNotFoundError {
  error: 'NOT_FOUND';
  message: string;
}

type ApiErrorBody = ApiValidationError | ApiConflictError | ApiLimitError | ApiNotFoundError;

function errorBody(err: unknown): ApiErrorBody | undefined {
  const axiosErr = err as AxiosError<ApiErrorBody>;
  return axiosErr.response?.data;
}

export function getFieldErrors(err: unknown): Record<string, string> {
  const body = errorBody(err);
  return body?.error === 'VALIDATION_ERROR' ? body.fields : {};
}

export function getConflictExistingEntryId(err: unknown): string | undefined {
  const body = errorBody(err);
  return body?.error === 'CONFLICT' ? body.existingEntryId : undefined;
}

export function isConflictError(err: unknown): boolean {
  return errorBody(err)?.error === 'CONFLICT';
}

/** Falls back to the API's `message`, then a generic string. */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  return errorBody(err)?.message ?? fallback;
}
