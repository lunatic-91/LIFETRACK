import express from 'express';
import request from 'supertest';

import { asyncHandler } from '../../middleware/asyncHandler';
import { notFoundHandler, globalErrorHandler } from '../../middleware/errorHandler';

function buildTestApp() {
  const app = express();
  app.use(express.json());

  app.get(
    '/throws-typed',
    asyncHandler(async () => {
      const err = { error: 'CONFLICT', message: 'Duplicate thing' };
      throw err;
    }),
  );

  app.get(
    '/throws-unexpected',
    asyncHandler(async () => {
      throw new Error('boom: something internal broke');
    }),
  );

  app.get(
    '/rejects',
    asyncHandler(async () => {
      await Promise.reject(new Error('async rejection'));
    }),
  );

  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}

describe('Global error handler', () => {
  test('a thrown typed error is returned with its matching status code', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/throws-typed');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'CONFLICT', message: 'Duplicate thing' });
  });

  test('an unexpected thrown error returns 500 with a correlation ID and no stack trace', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/throws-unexpected');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body.message).toBe('An unexpected error occurred');
    expect(typeof res.body.correlationId).toBe('string');
    expect(res.body.correlationId.length).toBeGreaterThan(0);

    // Never leak internals to the client.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('boom');
    expect(serialized).not.toContain('.ts:');
    expect(serialized).not.toContain('at ');
  });

  test('a rejected promise from an async handler reaches the error handler (Express 4 gap)', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/rejects');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });

  test('an unmatched route returns a 404 NOT_FOUND envelope', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND', message: 'Resource not found' });
  });

  test('each request gets a distinct correlation ID', async () => {
    const app = buildTestApp();
    const res1 = await request(app).get('/throws-unexpected');
    const res2 = await request(app).get('/throws-unexpected');

    expect(res1.body.correlationId).not.toBe(res2.body.correlationId);
  });
});
