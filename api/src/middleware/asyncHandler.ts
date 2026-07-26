import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 does not forward a rejected Promise from an async route handler
 * to the error-handling middleware — the request simply hangs instead of
 * reaching `globalErrorHandler`. Wrapping a handler with this utility
 * ensures any thrown/rejected error is passed to `next(err)`.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
