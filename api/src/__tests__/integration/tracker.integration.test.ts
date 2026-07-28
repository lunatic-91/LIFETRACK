import request from 'supertest';

import app from '../../index';
import { truncateAllTables, flushRedis, closeConnections } from './setup';

async function registerAndGetToken(email: string): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ email, password: 'a-valid-password-123' });
  return res.body.accessToken as string;
}

describe('Integration: Tracker + Entry end-to-end (create -> log entry -> streak update)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await flushRedis();
  });

  afterAll(async () => {
    await closeConnections();
  });

  test('creating a habit tracker and logging an entry updates its streak', async () => {
    const token = await registerAndGetToken('integration-tracker@example.com');
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

    // ---- Create tracker ----
    const createRes = await auth(request(app).post('/trackers')).send({
      name: 'Exercise',
      dataType: 'boolean',
      frequency: 'daily',
      isHabit: true,
    });

    expect(createRes.status).toBe(201);
    const trackerId = createRes.body.id as string;

    // ---- Log today's entry ----
    const today = new Date().toISOString().slice(0, 10);
    const entryRes = await auth(request(app).post(`/trackers/${trackerId}/entries`)).send({
      value: true,
      localDate: today,
      localTimestamp: new Date().toISOString(),
    });

    expect(entryRes.status).toBe(201);

    // ---- Streak reflects the completed day ----
    const streakRes = await auth(request(app).get(`/trackers/${trackerId}/streak`));
    expect(streakRes.status).toBe(200);
    expect(streakRes.body.currentStreak).toBeGreaterThanOrEqual(1);

    // ---- Tracker appears in the active list ----
    const listRes = await auth(request(app).get('/trackers'));
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((t: { id: string }) => t.id === trackerId)).toBe(true);
  });

  test('submitting a duplicate entry for the same day requires confirmOverwrite', async () => {
    const token = await registerAndGetToken('integration-tracker-2@example.com');
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

    const createRes = await auth(request(app).post('/trackers')).send({
      name: 'Water',
      dataType: 'numeric',
      frequency: 'daily',
      validRange: { min: 0, max: 10 },
    });
    const trackerId = createRes.body.id as string;
    const today = new Date().toISOString().slice(0, 10);
    const localTimestamp = new Date().toISOString();

    await auth(request(app).post(`/trackers/${trackerId}/entries`)).send({
      value: 3,
      localDate: today,
      localTimestamp,
    });

    const conflictRes = await auth(request(app).post(`/trackers/${trackerId}/entries`)).send({
      value: 5,
      localDate: today,
      localTimestamp,
    });
    expect(conflictRes.status).toBe(409);

    const overwriteRes = await auth(request(app).post(`/trackers/${trackerId}/entries`)).send({
      value: 5,
      localDate: today,
      localTimestamp,
      confirmOverwrite: true,
    });
    expect(overwriteRes.status).toBe(201);
    expect(overwriteRes.body.value).toBe(5);
  });
});
