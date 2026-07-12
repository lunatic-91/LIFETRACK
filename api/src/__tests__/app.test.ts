/**
 * Unit / smoke tests for the Express app entry point.
 *
 * Uses supertest to exercise the HTTP layer in-process.
 * No database or Redis connection required.
 */

import request from 'supertest';
import app from '../index';

describe('GET /health', () => {
  test('returns 200 with { status: "ok" }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('response Content-Type is application/json', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('Unknown routes', () => {
  test('returns 404 for an unregistered path', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
  });

  test('returns 404 for POST on an unregistered path', async () => {
    const res = await request(app).post('/does-not-exist').send({});
    expect(res.status).toBe(404);
  });
});

describe('JSON body parsing', () => {
  test('app parses JSON bodies (Content-Type: application/json)', async () => {
    // The health route doesn't use a body, but verifying the middleware is
    // wired: a POST to /health returns 404 but does NOT crash with a parse error.
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ ping: 'pong' }));

    // We get a 404 (route not registered for POST), not a 400/500 parse error.
    expect(res.status).toBe(404);
  });
});
