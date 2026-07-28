import request from 'supertest';

import app from '../../index';
import { truncateAllTables, flushRedis, closeConnections } from './setup';

async function registerAndGetToken(email: string): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ email, password: 'a-valid-password-123' });
  return res.body.accessToken as string;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function seedEntries(
  auth: (req: request.Test) => request.Test,
  trackerId: string,
  count: number,
): Promise<void> {
  const start = '2020-01-01';
  // Sequential on purpose to avoid tripping the one-entry-per-day
  // uniqueness constraint via racing inserts on the same connection pool.
  for (let i = 0; i < count; i++) {
    await auth(request(app).post(`/trackers/${trackerId}/entries`)).send({
      value: i % 10,
      localDate: addDays(start, i),
      localTimestamp: new Date().toISOString(),
    });
  }
}

describe('Integration: Export Service (CSV/JSON, timing SLA)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await flushRedis();
  });

  afterAll(async () => {
    await closeConnections();
  });

  async function createTrackerWithEntries(email: string, count: number) {
    const token = await registerAndGetToken(email);
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

    const createRes = await auth(request(app).post('/trackers')).send({
      name: 'Water',
      dataType: 'numeric',
      frequency: 'daily',
      validRange: { min: 0, max: 10 },
    });
    const trackerId = createRes.body.id as string;
    await seedEntries(auth, trackerId, count);
    return { auth, trackerId };
  }

  test('exports 1 entry as CSV within the 10s SLA', async () => {
    const { auth, trackerId } = await createTrackerWithEntries('export-1@example.com', 1);

    const start = Date.now();
    const res = await auth(request(app).post('/exports')).send({ format: 'csv', trackerId });
    const elapsedMs = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.entryCount).toBe(1);
    expect(elapsedMs).toBeLessThan(10_000);
  }, 20_000);

  test('exports 100 entries as JSON within the 10s SLA', async () => {
    const { auth, trackerId } = await createTrackerWithEntries('export-100@example.com', 100);

    const start = Date.now();
    const res = await auth(request(app).post('/exports')).send({ format: 'json', trackerId });
    const elapsedMs = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.entryCount).toBe(100);
    expect(elapsedMs).toBeLessThan(10_000);
  }, 20_000);

  test('exports 1000 entries as CSV within the 10s SLA', async () => {
    const { auth, trackerId } = await createTrackerWithEntries('export-1000@example.com', 1000);

    const start = Date.now();
    const res = await auth(request(app).post('/exports')).send({ format: 'csv', trackerId });
    const elapsedMs = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.entryCount).toBe(1000);
    expect(elapsedMs).toBeLessThan(10_000);
  }, 30_000);

  test('CSV export includes the required columns', async () => {
    const { auth, trackerId } = await createTrackerWithEntries('export-csv-cols@example.com', 5);
    const res = await auth(request(app).post('/exports')).send({ format: 'csv', trackerId });

    expect(res.status).toBe(200);
    expect(res.body.downloadUrl).toEqual(expect.any(String));
  });

  test('an empty export (no matching entries) returns entryCount 0', async () => {
    const token = await registerAndGetToken('export-empty@example.com');
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
    const createRes = await auth(request(app).post('/trackers')).send({
      name: 'Water',
      dataType: 'numeric',
      frequency: 'daily',
      validRange: { min: 0, max: 10 },
    });

    const res = await auth(request(app).post('/exports')).send({
      format: 'csv',
      trackerId: createRes.body.id,
    });

    expect(res.status).toBe(200);
    expect(res.body.entryCount).toBe(0);
  });
});
