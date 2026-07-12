import { Queue } from 'bullmq';

import { getKnex } from '../db/client';
import type { Insight, TrendDirection } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TREND_WINDOW = 14;
const IMPROVING_THRESHOLD = 0.05;
const DECLINING_THRESHOLD = -0.05;
const CORRELATION_MIN_SHARED_DAYS = 30;
const CORRELATION_THRESHOLD = 0.5;

export const INSIGHT_QUEUE_NAME = 'insight-recalc';
/** Insights must be recalculated within 24h of a new Entry (Req 9.2). */
export const INSIGHT_RECALC_MAX_DELAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Notification/job queue (same plain {host,port} pattern as the other
// services — BullMQ bundles its own ioredis, kept separate from getRedis()).
// ---------------------------------------------------------------------------

let insightQueue: Queue | null = null;

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
    // Fail fast rather than retrying forever: an unreachable Redis should
    // reject the calling promise quickly (this is a fire-and-forget queue
    // add, not something worth blocking a request — or a test suite — on).
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    connectTimeout: 2000,
  };
}

export function getInsightQueue(): Queue {
  if (!insightQueue) {
    insightQueue = new Queue(INSIGHT_QUEUE_NAME, { connection: getQueueConnection() });
  }
  return insightQueue;
}

/**
 * Enqueues a background recalculation job for a tracker. Fire-and-forget
 * from the caller's perspective — the 24h SLA (Req 9.2) is a queue-side
 * concern (job delay / worker throughput), not something the request path
 * needs to wait on.
 */
export async function enqueueInsightRecalc(userId: string, trackerId: string): Promise<void> {
  const queue = getInsightQueue();
  await queue.add('recalc', { userId, trackerId }, { attempts: 3 });
}

// ---------------------------------------------------------------------------
// Pure math: linear regression slope (Property 15, 17)
// ---------------------------------------------------------------------------

/**
 * Ordinary least-squares slope of `values` against their index (0, 1, 2, …).
 * Returns 0 for fewer than 2 points (no meaningful slope).
 */
export function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  const xs = Array.from({ length: n }, (_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = values.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    numerator += dx * (values[i]! - meanY);
    denominator += dx * dx;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

export function classifyTrend(slope: number): TrendDirection {
  if (slope > IMPROVING_THRESHOLD) return 'improving';
  if (slope < DECLINING_THRESHOLD) return 'declining';
  return 'stable';
}

export interface TrendComputation {
  direction: TrendDirection;
  slope: number;
}

/**
 * Computes a trend over the most recent 14 Entries (chronologically
 * ordered), or returns null when fewer than 14 Entries exist.
 *
 * Requirements: 9.1, 9.5, 9.6
 */
export function calculateTrend(orderedValues: number[]): TrendComputation | null {
  if (orderedValues.length < TREND_WINDOW) return null;

  const window = orderedValues.slice(-TREND_WINDOW);
  const slope = linearRegressionSlope(window);
  return { direction: classifyTrend(slope), slope };
}

// ---------------------------------------------------------------------------
// Pure math: Pearson correlation (Property 16)
// ---------------------------------------------------------------------------

/**
 * Pearson correlation coefficient between two equal-length numeric series.
 * Returns 0 when either series has zero variance (undefined correlation).
 */
export function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return 0;

  const meanX = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX === 0 || varY === 0) return 0;
  return cov / Math.sqrt(varX * varY);
}

// ---------------------------------------------------------------------------
// DB orchestration
// ---------------------------------------------------------------------------

interface EntryValueRow {
  local_date: string;
  value_numeric: string | number | null;
  value_boolean: boolean | null;
}

function toNumericSeries(rows: EntryValueRow[]): { date: string; value: number }[] {
  return rows
    .map((r) => {
      if (r.value_numeric !== null) return { date: r.local_date, value: Number(r.value_numeric) };
      if (r.value_boolean !== null) return { date: r.local_date, value: r.value_boolean ? 1 : 0 };
      return null;
    })
    .filter((v): v is { date: string; value: number } => v !== null);
}

/**
 * Recalculates and persists Insights for one Tracker: a trend Insight (Req
 * 9.1, 9.5, 9.6) plus correlation Insights (Req 9.4) against every other
 * numeric-or-boolean Tracker owned by the same user.
 *
 * Requirements: 9.1, 9.2, 9.4, 9.5, 9.6
 */
export async function recalculateInsightsForTracker(
  userId: string,
  trackerId: string,
): Promise<void> {
  const knex = getKnex();

  const ownRows = (await knex('entries')
    .where({ tracker_id: trackerId, user_id: userId })
    .orderBy('local_date', 'asc')
    .select('local_date', 'value_numeric', 'value_boolean')) as EntryValueRow[];

  const ownSeries = toNumericSeries(ownRows);

  // ---- Trend insight ----
  const trend = calculateTrend(ownSeries.map((e) => e.value));
  if (trend) {
    await knex('insights').insert({
      user_id: userId,
      type: 'trend',
      payload: JSON.stringify({
        trackerId,
        direction: trend.direction,
        slope: trend.slope,
      }),
    });
  }

  // ---- Correlation insights against every other numeric tracker ----
  if (ownSeries.length >= CORRELATION_MIN_SHARED_DAYS) {
    const otherTrackers = (await knex('trackers')
      .where({ user_id: userId })
      .andWhere('id', '!=', trackerId)
      .whereIn('data_type', ['numeric', 'boolean'])
      .select('id')) as { id: string }[];

    const ownByDate = new Map(ownSeries.map((e) => [e.date, e.value]));

    for (const other of otherTrackers) {
      const otherRows = (await knex('entries')
        .where({ tracker_id: other.id, user_id: userId })
        .select('local_date', 'value_numeric', 'value_boolean')) as EntryValueRow[];

      const otherByDate = new Map(
        toNumericSeries(otherRows).map((e) => [e.date, e.value]),
      );

      const sharedDates = [...ownByDate.keys()].filter((d) => otherByDate.has(d));
      if (sharedDates.length < CORRELATION_MIN_SHARED_DAYS) continue;

      const xs = sharedDates.map((d) => ownByDate.get(d)!);
      const ys = sharedDates.map((d) => otherByDate.get(d)!);
      const r = pearsonCorrelation(xs, ys);

      if (Math.abs(r) >= CORRELATION_THRESHOLD) {
        await knex('insights').insert({
          user_id: userId,
          type: 'correlation',
          payload: JSON.stringify({
            trackerIdA: trackerId,
            trackerIdB: other.id,
            pearsonR: r,
          }),
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// listInsights
// ---------------------------------------------------------------------------

interface InsightRow {
  id: string;
  user_id: string;
  type: 'trend' | 'correlation';
  payload: Record<string, unknown> | string;
  generated_at: string | Date;
}

function rowToInsight(row: InsightRow): Insight {
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
  const generatedAt = new Date(row.generated_at).toISOString();

  if (row.type === 'trend') {
    return {
      id: row.id,
      type: 'trend',
      userId: row.user_id,
      trackerId: payload['trackerId'],
      direction: payload['direction'],
      slope: payload['slope'],
      generatedAt,
    };
  }

  return {
    id: row.id,
    type: 'correlation',
    userId: row.user_id,
    trackerIdA: payload['trackerIdA'],
    trackerIdB: payload['trackerIdB'],
    pearsonR: payload['pearsonR'],
    generatedAt,
  };
}

/**
 * Requirements: 9.3
 */
export async function listInsights(userId: string): Promise<Insight[]> {
  const knex = getKnex();
  const rows = (await knex('insights')
    .where({ user_id: userId })
    .orderBy('generated_at', 'desc')) as InsightRow[];

  return rows.map(rowToInsight);
}
