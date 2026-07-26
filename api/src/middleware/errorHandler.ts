import crypto from 'crypto';

import type { NextFunction, Request, Response } from 'express';

/**
 * Requirements: 1.2, 1.3, 1.5, 2.2, 2.10, 3.2, 5.2
 */

interface KnownErrorShape {
  error: string;
  message: string;
  [key: string]: unknown;
}

function isKnownErrorShape(value: unknown): value is KnownErrorShape {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'string'
  );
}

const STATUS_BY_ERROR_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  LIMIT_ERROR: 400,
  AUTH_ERROR: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMIT: 429,
  EXPORT_FAILED: 500,
  INTERNAL_ERROR: 500,
};

/**
 * 404 fallback for routes that don't match any router.
 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Resource not found' });
}

/**
 * Global Express error handler. Must be mounted last, after every route.
 *
 * - If the thrown value already looks like one of our structured error
 *   envelopes (VALIDATION_ERROR, CONFLICT, etc.), it's forwarded as-is with
 *   its matching status code — this mainly covers errors thrown by
 *   database/queue calls that a service didn't wrap itself.
 * - Anything else is an unexpected failure: logged server-side with a
 *   correlation ID, and returned as a generic 500 INTERNAL_ERROR that never
 *   leaks a stack trace or internal message to the client.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function globalErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (isKnownErrorShape(err)) {
    const status = STATUS_BY_ERROR_CODE[err.error] ?? 500;
    res.status(status).json(err);
    return;
  }

  const correlationId = crypto.randomUUID();
  // eslint-disable-next-line no-console
  console.error(`[${correlationId}] Unhandled error:`, err);

  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    correlationId,
  });
}
