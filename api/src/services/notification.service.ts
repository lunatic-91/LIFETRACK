/**
 * Notification Service — Reminder CRUD, global/per-Reminder enable toggle,
 * BullMQ scheduling for recurring Reminder fires, and the
 * suppression-aware delivery rule consumed by NotifWorker.
 * Feature: lifetrack-app
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { Queue } from 'bullmq';

import { getKnex } from '../db/client';
import type { Reminder, ValidationError, NotFoundError } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const NOTIFICATION_QUEUE_NAME = 'notifications';

/** Reminders must reach an online device within 60s of firing/reconnect (Req 8.2, 8.5). */
export const REMINDER_DELIVERY_MAX_DELAY_MS = 60 * 1000;

const VALID_DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ---------------------------------------------------------------------------
// Notification queue (mirrors the pattern used in streak.service.ts /
// goal.service.ts: a plain {host, port} object rather than a shared
// ioredis instance, since BullMQ bundles its own nested ioredis dependency;
// fast-fail retry settings so a missing Redis never hangs a request).
// ---------------------------------------------------------------------------

let notificationQueue: Queue | null = null;

function getQueueConnection(): {
  host: string;
  port: number;
  maxRetriesPerRequest: number;
  retryStrategy: () => null;
  connectTimeout: number;
} {
  const redisUrl = process.env['REDIS_URL'];
  const base = redisUrl
    ? (() => {
        const url = new URL(redisUrl);
        return { host: url.hostname, port: url.port ? Number(url.port) : 6379 };
      })()
    : { host: '127.0.0.1', port: 6379 };

  return {
    ...base,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    connectTimeout: 2000,
  };
}

export function getNotificationQueue(): Queue {
  if (!notificationQueue) {
    notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, { connection: getQueueConnection() });
  }
  return notificationQueue;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateReminderRequest {
  trackerId: string;
  timeOfDay: string; // HH:MM
  daysOfWeek: number[]; // 0=Sun … 6=Sat
}

export interface UpdateReminderRequest {
  timeOfDay?: string;
  daysOfWeek?: number[];
  enabled?: boolean;
}

export interface ReminderFireJob {
  type: 'reminder-fire';
  reminderId: string;
  userId: string;
  trackerId: string;
}

export interface PushNotificationPayload {
  userId: string;
  title: string;
  body: string;
}

interface ReminderRow {
  id: string;
  user_id: string;
  tracker_id: string;
  time_of_day: string;
  days_of_week: number[];
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Row <-> domain mapping
// ---------------------------------------------------------------------------

function rowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    userId: row.user_id,
    trackerId: row.tracker_id,
    timeOfDay: row.time_of_day.slice(0, 5),
    daysOfWeek: row.days_of_week,
    enabled: row.enabled,
  };
}

// ---------------------------------------------------------------------------
// Validation (Req 8.1)
// ---------------------------------------------------------------------------

function validateReminderInput(timeOfDay: string, daysOfWeek: number[]): Record<string, string> {
  const fields: Record<string, string> = {};

  if (!TIME_OF_DAY_PATTERN.test(timeOfDay)) {
    fields['timeOfDay'] = 'Time of day must be in HH:MM 24-hour format';
  }

  const isValidDaySet =
    daysOfWeek.length > 0 &&
    daysOfWeek.every((d) => VALID_DAYS_OF_WEEK.includes(d)) &&
    new Set(daysOfWeek).size === daysOfWeek.length;

  if (!isValidDaySet) {
    fields['daysOfWeek'] = 'Days of week must be unique integers between 0 (Sun) and 6 (Sat)';
  }

  return fields;
}

// ---------------------------------------------------------------------------
// BullMQ job-scheduler sync — one recurring scheduler per configured day
// (Req 8.1, 8.2). Config changes (Req 8.4) simply unschedule + reschedule;
// `enabled`/global toggles are re-checked at fire time in
// `processReminderFire` rather than by adding/removing schedulers, so
// disabling never loses the underlying Reminder configuration.
// ---------------------------------------------------------------------------

function jobSchedulerId(reminderId: string, dayOfWeek: number): string {
  return `reminder:${reminderId}:day:${dayOfWeek}`;
}

function cronPatternFor(timeOfDay: string, dayOfWeek: number): string {
  const [hour, minute] = timeOfDay.split(':');
  return `${minute} ${hour} * * ${dayOfWeek}`;
}

async function scheduleReminderJobs(reminder: ReminderRow): Promise<void> {
  const queue = getNotificationQueue();
  const job: ReminderFireJob = {
    type: 'reminder-fire',
    reminderId: reminder.id,
    userId: reminder.user_id,
    trackerId: reminder.tracker_id,
  };

  await Promise.all(
    reminder.days_of_week.map((day) =>
      queue.upsertJobScheduler(
        jobSchedulerId(reminder.id, day),
        { pattern: cronPatternFor(reminder.time_of_day, day) },
        { name: 'reminder-fire', data: job },
      ),
    ),
  );
}

async function unscheduleReminderJobs(reminderId: string, daysOfWeek: number[]): Promise<void> {
  const queue = getNotificationQueue();
  await Promise.all(
    daysOfWeek.map((day) => queue.removeJobScheduler(jobSchedulerId(reminderId, day))),
  );
}

// ---------------------------------------------------------------------------
// createReminder / listReminders / updateReminder / deleteReminder
// ---------------------------------------------------------------------------

/** Requirements: 8.1 */
export async function createReminder(
  userId: string,
  req: CreateReminderRequest,
): Promise<Reminder | ValidationError> {
  const fields = validateReminderInput(req.timeOfDay, req.daysOfWeek);
  if (!req.trackerId) {
    fields['trackerId'] = 'A linked tracker is required';
  }

  if (Object.keys(fields).length > 0) {
    return {
      error: 'VALIDATION_ERROR',
      message: 'Invalid reminder request',
      fields,
    } satisfies ValidationError;
  }

  const knex = getKnex();

  const [inserted] = (await knex('reminders')
    .insert({
      user_id: userId,
      tracker_id: req.trackerId,
      time_of_day: req.timeOfDay,
      days_of_week: req.daysOfWeek,
      enabled: true,
    })
    .returning('*')) as ReminderRow[];

  await scheduleReminderJobs(inserted!);

  return rowToReminder(inserted!);
}

/** Requirements: 8.1, 8.4 */
export async function listReminders(userId: string): Promise<Reminder[]> {
  const knex = getKnex();
  const rows = (await knex('reminders')
    .where({ user_id: userId })
    .orderBy('time_of_day', 'asc')) as ReminderRow[];

  return rows.map(rowToReminder);
}

/** Requirements: 8.1, 8.4 */
export async function updateReminder(
  userId: string,
  reminderId: string,
  updates: UpdateReminderRequest,
): Promise<Reminder | ValidationError | NotFoundError> {
  const knex = getKnex();

  const existing = (await knex('reminders').where({ id: reminderId, user_id: userId }).first()) as
    | ReminderRow
    | undefined;

  if (!existing) {
    return { error: 'NOT_FOUND', message: 'Reminder not found' } satisfies NotFoundError;
  }

  const scheduleChanged = updates.timeOfDay !== undefined || updates.daysOfWeek !== undefined;

  if (scheduleChanged) {
    const nextTimeOfDay = updates.timeOfDay ?? existing.time_of_day.slice(0, 5);
    const nextDaysOfWeek = updates.daysOfWeek ?? existing.days_of_week;
    const fields = validateReminderInput(nextTimeOfDay, nextDaysOfWeek);
    if (Object.keys(fields).length > 0) {
      return {
        error: 'VALIDATION_ERROR',
        message: 'Invalid reminder update',
        fields,
      } satisfies ValidationError;
    }
  }

  const patch: Record<string, unknown> = {};
  if (updates.timeOfDay !== undefined) patch['time_of_day'] = updates.timeOfDay;
  if (updates.daysOfWeek !== undefined) patch['days_of_week'] = updates.daysOfWeek;
  if (updates.enabled !== undefined) patch['enabled'] = updates.enabled;

  const [updated] = (await knex('reminders')
    .where({ id: reminderId, user_id: userId })
    .update(patch)
    .returning('*')) as ReminderRow[];

  if (scheduleChanged) {
    // Re-sync BullMQ job schedulers to the new time/days (Req 8.4).
    await unscheduleReminderJobs(existing.id, existing.days_of_week);
    await scheduleReminderJobs(updated!);
  }

  return rowToReminder(updated!);
}

/** Requirements: 8.1, 8.4 */
export async function deleteReminder(
  userId: string,
  reminderId: string,
): Promise<true | NotFoundError> {
  const knex = getKnex();

  const existing = (await knex('reminders').where({ id: reminderId, user_id: userId }).first()) as
    | ReminderRow
    | undefined;

  if (!existing) {
    return { error: 'NOT_FOUND', message: 'Reminder not found' } satisfies NotFoundError;
  }

  await knex('reminders').where({ id: reminderId, user_id: userId }).delete();
  await unscheduleReminderJobs(existing.id, existing.days_of_week);

  return true;
}

/**
 * Enables/disables Reminder delivery for a User across every Tracker,
 * without touching any individual Reminder's own `enabled` flag or
 * schedule (Req 8.4). Enforced at delivery time in `processReminderFire`.
 */
export async function setGlobalEnabled(
  userId: string,
  enabled: boolean,
): Promise<{ enabled: boolean }> {
  const knex = getKnex();
  await knex('users').where({ id: userId }).update({ notifications_enabled: enabled });
  return { enabled };
}

// ---------------------------------------------------------------------------
// Delivery (consumed by NotifWorker)
// ---------------------------------------------------------------------------

/**
 * Best-effort push delivery. There is no device/session/FCM-APNs
 * integration yet in this codebase (see design.md Notification_Service) —
 * this is the single seam a future push-provider integration plugs into.
 * Logging is intentional so delivery is observable in the interim.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- async signature is intentional: this is the seam a real push-provider call will await.
export async function deliverPushNotification(payload: PushNotificationPayload): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[push] -> user ${payload.userId}: ${payload.title} — ${payload.body}`);
}

/**
 * Core suppression + delivery rule for a fired Reminder (Property 14): if
 * the User already has an Entry for the linked Tracker on the current
 * local calendar day, the Reminder is suppressed — otherwise it is
 * delivered. Also honours the per-Reminder `enabled` flag and the User's
 * global notification toggle (Req 8.3, 8.4).
 *
 * Re-evaluates suppression fresh on every call, so this same function
 * doubles as the offline-reconnect re-check (Req 8.5) — callers just
 * invoke it again once the device reconnects.
 *
 * `today` is injectable for tests; defaults to the current UTC date.
 */
export async function processReminderFire(
  job: ReminderFireJob,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<{ delivered: boolean }> {
  const knex = getKnex();

  const reminder = (await knex('reminders').where({ id: job.reminderId }).first()) as
    | ReminderRow
    | undefined;

  if (!reminder || !reminder.enabled) {
    return { delivered: false };
  }

  const user = (await knex('users')
    .where({ id: job.userId })
    .select('notifications_enabled')
    .first()) as { notifications_enabled: boolean } | undefined;

  if (!user || user.notifications_enabled === false) {
    return { delivered: false };
  }

  // Req 8.3 — suppress if an Entry already exists today for this Tracker.
  const todaysEntry = (await knex('entries')
    .where({ tracker_id: job.trackerId, local_date: today })
    .first()) as { id: string } | undefined;

  if (todaysEntry) {
    return { delivered: false };
  }

  const tracker = (await knex('trackers').where({ id: job.trackerId }).select('name').first()) as
    | { name: string }
    | undefined;

  await deliverPushNotification({
    userId: job.userId,
    title: 'Reminder',
    body: `Don't forget to log ${tracker?.name ?? 'your tracker'} today.`,
  });

  return { delivered: true };
}
