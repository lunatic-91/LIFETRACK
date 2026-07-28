import request from 'supertest';

import app from '../../index';
import { processReminderFire } from '../../services/notification.service';
import type { ReminderFireJob } from '../../services/notification.service';
import { truncateAllTables, flushRedis, closeConnections } from './setup';

async function registerAndGetToken(email: string): Promise<{ token: string; userId: string }> {
  const res = await request(app)
    .post('/auth/register')
    .send({ email, password: 'a-valid-password-123' });
  const decoded = JSON.parse(
    Buffer.from(res.body.accessToken.split('.')[1], 'base64url').toString('utf-8'),
  ) as { sub: string };
  return { token: res.body.accessToken as string, userId: decoded.sub };
}

describe('Integration: Notification Service (reminder scheduling, suppression, offline re-check)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await flushRedis();
  });

  afterAll(async () => {
    await closeConnections();
  });

  test('a reminder is delivered when no entry exists yet, then suppressed once one is logged', async () => {
    const { token, userId } = await registerAndGetToken('integration-notif@example.com');
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

    const trackerRes = await auth(request(app).post('/trackers')).send({
      name: 'Meditation',
      dataType: 'boolean',
      frequency: 'daily',
      isHabit: true,
    });
    const trackerId = trackerRes.body.id as string;

    const reminderRes = await auth(request(app).post('/reminders')).send({
      trackerId,
      timeOfDay: '08:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(reminderRes.status).toBe(201);
    const reminderId = reminderRes.body.id as string;

    const job: ReminderFireJob = { type: 'reminder-fire', reminderId, userId, trackerId };
    const today = new Date().toISOString().slice(0, 10);

    // ---- No entry yet: the reminder should fire ----
    const firstFire = await processReminderFire(job, today);
    expect(firstFire.delivered).toBe(true);

    // ---- Log today's entry ----
    const entryRes = await auth(request(app).post(`/trackers/${trackerId}/entries`)).send({
      value: true,
      localDate: today,
      localTimestamp: new Date().toISOString(),
    });
    expect(entryRes.status).toBe(201);

    // ---- Suppressed now that today's entry exists (Req 8.3) ----
    const secondFire = await processReminderFire(job, today);
    expect(secondFire.delivered).toBe(false);
  });

  test('disabling reminders globally suppresses delivery regardless of entry state', async () => {
    const { token, userId } = await registerAndGetToken('integration-notif-global@example.com');
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

    const trackerRes = await auth(request(app).post('/trackers')).send({
      name: 'Meditation',
      dataType: 'boolean',
      frequency: 'daily',
      isHabit: true,
    });
    const trackerId = trackerRes.body.id as string;

    const reminderRes = await auth(request(app).post('/reminders')).send({
      trackerId,
      timeOfDay: '08:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
    const reminderId = reminderRes.body.id as string;

    const globalRes = await auth(request(app).patch('/reminders/global')).send({ enabled: false });
    expect(globalRes.status).toBe(200);

    const job: ReminderFireJob = { type: 'reminder-fire', reminderId, userId, trackerId };
    const result = await processReminderFire(job);
    expect(result.delivered).toBe(false);
  });

  test('offline reconnect re-check: re-invoking after the device reconnects reflects the latest entry state', async () => {
    const { token, userId } = await registerAndGetToken('integration-notif-offline@example.com');
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

    const trackerRes = await auth(request(app).post('/trackers')).send({
      name: 'Journaling',
      dataType: 'boolean',
      frequency: 'daily',
      isHabit: true,
    });
    const trackerId = trackerRes.body.id as string;

    const reminderRes = await auth(request(app).post('/reminders')).send({
      trackerId,
      timeOfDay: '20:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
    const reminderId = reminderRes.body.id as string;
    const job: ReminderFireJob = { type: 'reminder-fire', reminderId, userId, trackerId };
    const today = new Date().toISOString().slice(0, 10);

    // Device was offline when the reminder was originally due; while
    // offline, the user submitted the entry from another device.
    await auth(request(app).post(`/trackers/${trackerId}/entries`)).send({
      value: true,
      localDate: today,
      localTimestamp: new Date().toISOString(),
    });

    // On reconnect, the same job is re-checked — suppression rule wins.
    const reconnectResult = await processReminderFire(job, today);
    expect(reconnectResult.delivered).toBe(false);
  });
});
