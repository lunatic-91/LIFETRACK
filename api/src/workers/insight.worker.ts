/**
 * Insight Worker — processes `insight-recalc` jobs enqueued by
 * enqueueInsightRecalc() (called after each Entry save). Runs as its own
 * process (`node dist/workers/insight.worker.js`) on VM2, separate from the
 * HTTP server, so a slow recalculation never blocks API requests.
 *
 * Requirements: 9.2
 */

import { Worker } from 'bullmq';

import { INSIGHT_QUEUE_NAME, recalculateInsightsForTracker } from '../services/insight.service';

interface InsightJobData {
  userId: string;
  trackerId: string;
}

function getWorkerConnection(): { host: string; port: number } {
  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl) {
    const url = new URL(redisUrl);
    return { host: url.hostname, port: url.port ? Number(url.port) : 6379 };
  }
  return { host: '127.0.0.1', port: 6379 };
}

export function startInsightWorker(): Worker<InsightJobData> {
  return new Worker<InsightJobData>(
    INSIGHT_QUEUE_NAME,
    async (job) => {
      await recalculateInsightsForTracker(job.data.userId, job.data.trackerId);
    },
    {
      connection: getWorkerConnection(),
      // Kept at 1 on purpose: VM2 has 1 OCPU / 1GB total, shared with the
      // Express API — a single concurrent job avoids competing for memory.
      concurrency: 1,
    },
  );
}

if (require.main === module) {
  const worker = startInsightWorker();
  // eslint-disable-next-line no-console
  console.log('Insight worker started');

  worker.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`Insight job ${job?.id} failed:`, err);
  });
}
