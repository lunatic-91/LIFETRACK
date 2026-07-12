import { Queue } from 'bullmq';

import { getKnex } from '../db/client';
import type { Goal, GoalDirection, ValidationError, NotFoundError } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const NOTIFICATION_QUEUE_NAME = 'notifications';

/** Goal-completion notifications must be delivered within 5 minutes (Req 5.5). */
export const GOAL_COMPLETION_NOTIFICATION_MAX_DELAY_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Notification queue (mirrors the pattern used in streak.service.ts:
// a plain {host, port} object rather than a shared ioredis instance, since
// BullMQ bundles its own nested ioredis dependency).
// ---------------------------------------------------------------------------

let notificationQueue: Queue | null = null;

function getQueueConnection(): { host: string; port: number } {
  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl) {
    const url = new URL(redisUrl);
    return { host: url.hostname, port: url.port ? Number(url.port) : 6379 };
  }
  return { host: '127.0.0.1', port: 6379 };
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

export interface CreateGoalRequest {
  trackerId: string;
  targetValue: number;
  direction: GoalDirection;
  deadline: string; // YYYY-MM-DD
}

export interface UpdateGoalRequest {
  targetValue?: number;
  deadline?: string;
}

export interface GroupedGoals {
  active: Goal[];
  completed: Goal[];
  expired: Goal[];
}

interface GoalRow {
  id: string;
  user_id: string;
  tracker_id: string;
  target_value: string | number;
  direction: GoalDirection;
  deadline: string;
  status: 'active' | 'completed' | 'expired';
  progress_pct: string | number;
  created_at: string | Date;
  completed_at: string | Date | null;
  expired_at: string | Date | null;
}

function rowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    userId: row.user_id,
    trackerId: row.tracker_id,
    targetValue: Number(row.target_value),
    direction: row.direction,
    deadline: row.deadline.slice(0, 10),
    status: row.status,
    progressPct: Number(row.progress_pct),
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    expiredAt: row.expired_at ? new Date(row.expired_at).toISOString() : null,
  };
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Progress formula (Property 8)
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Ascending:  clamp((sum of entry values / target) * 100, 0, 100)
 * Descending: clamp((1 - (latest entry value / target)) * 100, 0, 100)
 *
 * Requirements: 5.3, 5.9
 */
export function computeProgressPct(
  direction: GoalDirection,
  targetValue: number,
  sumEntryValues: number,
  latestEntryValue: number,
): number {
  if (direction === 'ascending') {
    return clamp((sumEntryValues / targetValue) * 100, 0, 100);
  }
  return clamp((1 - latestEntryValue / targetValue) * 100, 0, 100);
}

// ---------------------------------------------------------------------------
// createGoal
// ---------------------------------------------------------------------------

/**
 * Requirements: 5.1, 5.2
 */
export async function createGoal(
  userId: string,
  req: CreateGoalRequest,
): Promise<Goal | ValidationError | NotFoundError> {
  if (!req.trackerId || !req.direction || req.targetValue === undefined || !req.deadline) {
    return {
      error: 'VALIDATION_ERROR',
      message: 'trackerId, targetValue, direction, and deadline are all required',
      fields: {
        ...(req.trackerId ? {} : { trackerId: 'A linked tracker is required' }),
        ...(req.targetValue === undefined ? { targetValue: 'A target value is required' } : {}),
        ...(req.direction ? {} : { direction: 'A goal direction is required' }),
        ...(req.deadline ? {} : { deadline: 'A deadline date is required' }),
      },
    } satisfies ValidationError;
  }

  if (req.deadline < todayDateOnly()) {
    return {
      error: 'VALIDATION_ERROR',
      message: 'Deadline must be a future date',
      fields: { deadline: 'A deadline date is required' },
    } satisfies ValidationError;
  }

  const knex = getKnex();

  const tracker = (await knex('trackers')
    .where({ id: req.trackerId, user_id: userId })
    .select('id')
    .first()) as { id: string } | undefined;

  if (!tracker) {
    return { error: 'NOT_FOUND', message: 'Tracker not found' } satisfies NotFoundError;
  }

  const [inserted] = (await knex('goals')
    .insert({
      user_id: userId,
      tracker_id: req.trackerId,
      target_value: req.targetValue,
      direction: req.direction,
      deadline: req.deadline,
    })
    .returning('*')) as GoalRow[];

  return rowToGoal(inserted!);
}

// ---------------------------------------------------------------------------
// listGoals
// ---------------------------------------------------------------------------

/**
 * Requirements: 5.7
 */
export async function listGoals(userId: string): Promise<GroupedGoals> {
  const knex = getKnex();
  const rows = (await knex('goals')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc')) as GoalRow[];

  const goals = rows.map(rowToGoal);

  return {
    active: goals.filter((g) => g.status === 'active'),
    completed: goals.filter((g) => g.status === 'completed'),
    expired: goals.filter((g) => g.status === 'expired'),
  };
}

// ---------------------------------------------------------------------------
// updateGoal
// ---------------------------------------------------------------------------

/**
 * Edits the target value or deadline of an active Goal and immediately
 * recalculates progress against the new target value.
 *
 * Requirements: 5.8
 */
export async function updateGoal(
  userId: string,
  goalId: string,
  updates: UpdateGoalRequest,
): Promise<Goal | ValidationError | NotFoundError> {
  if (updates.deadline !== undefined && updates.deadline < todayDateOnly()) {
    return {
      error: 'VALIDATION_ERROR',
      message: 'Deadline must be a future date',
      fields: { deadline: 'A deadline date is required' },
    } satisfies ValidationError;
  }

  const knex = getKnex();

  const goal = (await knex('goals')
    .where({ id: goalId, user_id: userId })
    .first()) as GoalRow | undefined;

  if (!goal) {
    return { error: 'NOT_FOUND', message: 'Goal not found' } satisfies NotFoundError;
  }

  const patch: Record<string, unknown> = {};
  if (updates.targetValue !== undefined) patch['target_value'] = updates.targetValue;
  if (updates.deadline !== undefined) patch['deadline'] = updates.deadline;

  // Recalculate progress immediately if the target value changed.
  if (updates.targetValue !== undefined) {
    const entryStats = (await knex('entries')
      .where({ tracker_id: goal.tracker_id })
      .orderBy('local_date', 'desc')
      .select('value_numeric')) as { value_numeric: string | number | null }[];

    const numericValues = entryStats
      .map((e) => (e.value_numeric === null ? null : Number(e.value_numeric)))
      .filter((v): v is number => v !== null);

    const sum = numericValues.reduce((acc, v) => acc + v, 0);
    const latest = numericValues[0] ?? 0;

    patch['progress_pct'] = computeProgressPct(
      goal.direction,
      updates.targetValue,
      sum,
      latest,
    );
  }

  const [updated] = (await knex('goals')
    .where({ id: goalId, user_id: userId })
    .update(patch)
    .returning('*')) as GoalRow[];

  return rowToGoal(updated!);
}

// ---------------------------------------------------------------------------
// updateGoalProgress — hook called by entry.service after each Entry save
// ---------------------------------------------------------------------------

/**
 * Recomputes progress for every active Goal linked to a tracker after a new
 * Entry is saved, marking Goals completed (and notifying) once progress
 * reaches 100%.
 *
 * Requirements: 5.3, 5.4, 5.5, 5.9
 */
export async function updateGoalProgress(trackerId: string): Promise<void> {
  const knex = getKnex();

  const goals = (await knex('goals')
    .where({ tracker_id: trackerId, status: 'active' })) as GoalRow[];

  if (goals.length === 0) return;

  const entryRows = (await knex('entries')
    .where({ tracker_id: trackerId })
    .orderBy('local_date', 'desc')
    .select('value_numeric')) as { value_numeric: string | number | null }[];

  const numericValues = entryRows
    .map((e) => (e.value_numeric === null ? null : Number(e.value_numeric)))
    .filter((v): v is number => v !== null);

  const sum = numericValues.reduce((acc, v) => acc + v, 0);
  const latest = numericValues[0] ?? 0;

  for (const goal of goals) {
    const targetValue = Number(goal.target_value);
    const progressPct = computeProgressPct(goal.direction, targetValue, sum, latest);
    const justCompleted = progressPct >= 100;

    await knex('goals')
      .where({ id: goal.id })
      .update({
        progress_pct: progressPct,
        ...(justCompleted ? { status: 'completed', completed_at: new Date() } : {}),
      });

    if (justCompleted) {
      const queue = getNotificationQueue();
      await queue.add(
        'goal-completed',
        { userId: goal.user_id, goalId: goal.id, trackerId },
        { delay: 0, attempts: 3 },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// expireOverdueGoals — meant to run on a scheduled job (Req 5.6)
// ---------------------------------------------------------------------------

export async function expireOverdueGoals(): Promise<number> {
  const knex = getKnex();
  const today = todayDateOnly();

  const rows = (await knex('goals')
    .where({ status: 'active' })
    .andWhere('deadline', '<', today)
    .update({ status: 'expired', expired_at: new Date() })
    .returning('id')) as { id: string }[];

  return rows.length;
}
