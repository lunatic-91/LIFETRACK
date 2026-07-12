/**
 * Streak Engine — habit streak calculation and milestone notifications.
 * Feature: lifetrack-app
 *
 * Requirements: 4.1, 4.2, 4.3, 4.5, 4.6
 */

import { Queue } from 'bullmq';

import { getKnex } from '../db/client';
import type { TrackerFrequency } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Streak lengths that trigger a congratulatory notification (Req 4.5). */
export const STREAK_MILESTONES = [7, 30, 66, 100] as const;

/** Milestone notifications must be delivered within 5 minutes (Req 4.5). */
export const MILESTONE_NOTIFICATION_MAX_DELAY_MS = 5 * 60 * 1000;

/** Grace-period window: one missed day may be forgiven per rolling window (Req 4.6). */
export const GRACE_PERIOD_WINDOW_DAYS = 7;

export const NOTIFICATION_QUEUE_NAME = 'notifications';
export const MISSED_DAY_QUEUE_NAME = 'streak-missed-day-check';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
}

export interface MilestoneNotificationJob {
  type: 'streak-milestone';
  userId: string;
  trackerId: string;
  streak: number;
}

interface TrackerRow {
  id: string;
  user_id: string;
  is_habit: boolean;
  grace_enabled: boolean;
  frequency: string | { intervalDays: number };
  created_at: string | Date;
}

interface EntryDateRow {
  local_date: string;
}

interface StreakCurrentRow {
  current_streak: number;
}

// ---------------------------------------------------------------------------
// Lazy BullMQ queue singletons
// ---------------------------------------------------------------------------

let notificationQueue: Queue | null = null;
let missedDayQueue: Queue | null = null;

/**
 * BullMQ's `Queue` accepts either a plain `{ host, port }` options object or
 * an `ioredis` instance. We deliberately use a plain object here (built from
 * the same env vars as `db/client#getRedis`) rather than sharing the
 * singleton `ioredis` instance, since BullMQ bundles its own nested
 * `ioredis` dependency and the two class instances are not
 * TypeScript-assignable to one another.
 */
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
        const parsed = new URL(redisUrl);
        return { host: parsed.hostname, port: Number(parsed.port || 6379) };
      })()
    : {
        host: process.env['REDIS_HOST'] ?? 'localhost',
        port: Number(process.env['REDIS_PORT'] ?? 6379),
      };

  return {
    ...base,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    connectTimeout: 2000,
  };
}

function getNotificationQueue(): Queue {
  if (!notificationQueue) {
    notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, { connection: getQueueConnection() });
  }
  return notificationQueue;
}

function getMissedDayQueue(): Queue {
  if (!missedDayQueue) {
    missedDayQueue = new Queue(MISSED_DAY_QUEUE_NAME, { connection: getQueueConnection() });
  }
  return missedDayQueue;
}

/**
 * Resets the module-level BullMQ queue singletons — used in tests to inject
 * mocked Queue instances.
 * @internal
 */
export function _resetQueues(): void {
  notificationQueue = null;
  missedDayQueue = null;
}

// ---------------------------------------------------------------------------
// Pure streak calculation (Property 10)
// ---------------------------------------------------------------------------

/**
 * Computes the current and longest streak from an ordered sequence of
 * scheduled-day completions (oldest first, one entry per scheduled day).
 *
 * With `graceEnabled = false` this reduces exactly to:
 *   - currentStreak = length of the longest suffix of consecutive `true`s
 *   - longestStreak = length of the longest consecutive run of `true`s ever
 *
 * With `graceEnabled = true`, one missed day (`false`) is forgiven per
 * rolling `GRACE_PERIOD_WINDOW_DAYS`-day window measured from the start of
 * the current streak (Req 4.6) — the streak survives the forgiven day but
 * does not grow on it.
 *
 * Requirements: 4.1, 4.2, 4.6
 */
export function calculateStreak(completions: boolean[], graceEnabled: boolean): StreakResult {
  let current = 0;
  let longest = 0;
  let streakStartIndex = 0;
  let graceUsedThisStreak = false;

  for (let i = 0; i < completions.length; i++) {
    if (completions[i]) {
      current += 1;
      longest = Math.max(longest, current);
      continue;
    }

    const withinGraceWindow =
      graceEnabled && !graceUsedThisStreak && i - streakStartIndex < GRACE_PERIOD_WINDOW_DAYS;

    if (withinGraceWindow) {
      // Req 4.6 — forgive this single missed day; the streak neither grows
      // nor resets.
      graceUsedThisStreak = true;
      continue;
    }

    // Req 4.2 — a missed day with no grace available resets the streak.
    current = 0;
    streakStartIndex = i + 1;
    graceUsedThisStreak = false;
  }

  return { currentStreak: current, longestStreak: longest };
}

// ---------------------------------------------------------------------------
// Scheduled-day helpers
// ---------------------------------------------------------------------------

function parseFrequency(raw: string | { intervalDays: number }): TrackerFrequency {
  if (raw === 'daily' || raw === 'weekly') return raw;
  // `frequency` is JSONB; the pg driver already deserializes it before knex
  // sees it, so `raw` is normally an object here — this only guards against
  // a raw JSON string sneaking through (e.g. a test double).
  return typeof raw === 'string' ? (JSON.parse(raw) as TrackerFrequency) : raw;
}

/** Adds `days` calendar days to a `YYYY-MM-DD` date string (UTC-based). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Builds the ordered list of scheduled local dates (`YYYY-MM-DD`, inclusive
 * of both ends) for a Tracker's frequency between `startDate` and `endDate`.
 *
 *  - `'daily'`             -> every calendar day
 *  - `'weekly'`            -> every 7th day starting from `startDate`
 *  - `{ intervalDays: N }` -> every Nth day starting from `startDate`
 */
export function getScheduledDates(
  frequency: TrackerFrequency,
  startDate: string,
  endDate: string,
): string[] {
  const step = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : frequency.intervalDays;

  const dates: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, step);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Milestone detection + notification enqueueing (Property 11)
// ---------------------------------------------------------------------------

export function isMilestone(streak: number): boolean {
  return (STREAK_MILESTONES as readonly number[]).includes(streak);
}

/**
 * Enqueues a congratulatory notification job for a milestone streak.
 * Delay is 0 (dispatch as soon as the worker picks it up), which trivially
 * satisfies the ≤5-minute delivery SLA (Req 4.5 / Property 11); the
 * Notification Worker owns actual delivery.
 */
export async function enqueueMilestoneNotification(
  userId: string,
  trackerId: string,
  streak: number,
): Promise<void> {
  const queue = getNotificationQueue();
  const job: MilestoneNotificationJob = { type: 'streak-milestone', userId, trackerId, streak };
  await queue.add('streak-milestone', job, { delay: 0 });
}

// ---------------------------------------------------------------------------
// recalculateStreak
// ---------------------------------------------------------------------------

/**
 * Recomputes and persists the current/longest streak for a Habit Tracker,
 * and enqueues a milestone notification if the new streak newly reaches
 * 7, 30, 66, or 100.
 *
 * Intended to run synchronously right after an Entry is saved (Req 4.1,
 * 4.3), and also from the nightly missed-day sweep so a stale streak is
 * reset even without a fresh Entry (Req 4.2). Non-habit Trackers are
 * skipped — streaks are only meaningful for Habits.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.5, 4.6
 */
export async function recalculateStreak(
  userId: string,
  trackerId: string,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<StreakResult | null> {
  const knex = getKnex();

  const tracker = (await knex('trackers')
    .where({ id: trackerId, user_id: userId })
    .select('id', 'user_id', 'is_habit', 'grace_enabled', 'frequency', 'created_at')
    .first()) as TrackerRow | undefined;

  if (!tracker || !tracker.is_habit) {
    return null;
  }

  const entryRows = (await knex('entries')
    .where({ tracker_id: trackerId })
    .select('local_date')
    .orderBy('local_date', 'asc')) as EntryDateRow[];

  const completedDates = new Set(entryRows.map((r) => r.local_date));

  const startDate = new Date(tracker.created_at).toISOString().slice(0, 10);
  const scheduledDates = getScheduledDates(parseFrequency(tracker.frequency), startDate, today);
  const completions = scheduledDates.map((d) => completedDates.has(d));

  const { currentStreak, longestStreak } = calculateStreak(completions, tracker.grace_enabled);

  const previous = (await knex('streaks')
    .where({ tracker_id: trackerId })
    .select('current_streak')
    .first()) as StreakCurrentRow | undefined;

  const lastCompletedDate =
    entryRows.length > 0 ? entryRows[entryRows.length - 1]!.local_date : null;

  // Upsert within 1 second of the entry save (Req 4.1) — a single indexed
  // write against the denormalised `streaks` table.
  await knex('streaks')
    .insert({
      tracker_id: trackerId,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      last_completed_date: lastCompletedDate,
    })
    .onConflict('tracker_id')
    .merge(['current_streak', 'longest_streak', 'last_completed_date']);

  // Req 4.5 — fire a milestone notification exactly on the transition into
  // a milestone value, not on every subsequent save while already past it.
  const previousStreak = previous?.current_streak ?? 0;
  if (currentStreak !== previousStreak && isMilestone(currentStreak)) {
    await enqueueMilestoneNotification(userId, trackerId, currentStreak);
  }

  return { currentStreak, longestStreak };
}

// ---------------------------------------------------------------------------
// Nightly missed-day sweep (Req 4.2 — mark missed days at 23:59 local time)
// ---------------------------------------------------------------------------

/**
 * Schedules the recurring BullMQ job that recalculates streaks for every
 * Habit Tracker once a day, so a Streak is reset even if the User never
 * opens the app to trigger a fresh `logEntry` call.
 *
 * NOTE: uses a fixed UTC cron (`'59 23 * * *'`) as a first pass; per-user
 * local-time scheduling driven by `users.timezone` is a documented
 * follow-up refinement once the Notification Worker lands.
 */
export async function scheduleMissedDayCheck(): Promise<void> {
  const queue = getMissedDayQueue();
  await queue.add(
    'daily-missed-day-check',
    {},
    {
      repeat: { pattern: '59 23 * * *' },
      jobId: 'daily-missed-day-check',
    },
  );
}

/**
 * Processor for the missed-day sweep: recalculates the streak for every
 * non-archived Habit Tracker across all users. Intended to be run by a
 * BullMQ Worker subscribed to `MISSED_DAY_QUEUE_NAME`.
 */
export async function runMissedDayCheck(today?: string): Promise<void> {
  const knex = getKnex();
  const habitTrackers = (await knex('trackers')
    .where({ is_habit: true, is_archived: false })
    .select('id', 'user_id')) as { id: string; user_id: string }[];

  for (const tracker of habitTrackers) {
    await recalculateStreak(tracker.user_id, tracker.id, today);
  }
}
