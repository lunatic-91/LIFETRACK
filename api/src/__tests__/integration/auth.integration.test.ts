import request from 'supertest';

import app from '../../index';
import { truncateAllTables, flushRedis, closeConnections } from './setup';

describe('Integration: Auth flow (register -> login -> refresh -> logout)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await flushRedis();
  });

  afterAll(async () => {
    await closeConnections();
  });

  const email = 'integration-auth@example.com';
  const password = 'a-valid-password-123';

  test('full session lifecycle against a real database and Redis', async () => {
    // ---- Register ----
    const registerRes = await request(app).post('/auth/register').send({ email, password });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.accessToken).toEqual(expect.any(String));
    expect(registerRes.body.refreshToken).toEqual(expect.any(String));

    // ---- Login ----
    const loginRes = await request(app).post('/auth/login').send({ email, password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.accessToken).toEqual(expect.any(String));
    const { refreshToken } = loginRes.body;

    // The new access token authenticates a protected route.
    const protectedRes = await request(app)
      .get('/trackers')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);
    expect(protectedRes.status).toBe(200);

    // ---- Refresh ----
    const refreshRes = await request(app).post('/auth/refresh').send({ refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toEqual(expect.any(String));
    expect(refreshRes.body.refreshToken).toEqual(expect.any(String));
    // Sliding refresh rotates the token.
    expect(refreshRes.body.refreshToken).not.toBe(refreshToken);

    // ---- Logout ----
    const logoutRes = await request(app)
      .post('/auth/logout')
      .send({ refreshToken: refreshRes.body.refreshToken });
    expect(logoutRes.status).toBe(204);

    // The now-revoked refresh token can no longer mint a new session.
    const reuseRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: refreshRes.body.refreshToken });
    expect(reuseRes.status).toBe(401);
  });

  test('registering the same email twice returns a conflict', async () => {
    await request(app).post('/auth/register').send({ email, password });
    const secondRes = await request(app).post('/auth/register').send({ email, password });

    expect(secondRes.status).toBe(409);
  });

  test('logging in with a wrong password returns a generic auth error', async () => {
    await request(app).post('/auth/register').send({ email, password });
    const res = await request(app)
      .post('/auth/login')
      .send({ email, password: 'wrong-password-entirely' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_ERROR');
  });
});
