/**
 * Notification Worker — processes the `notifications` queue: congratulatory
 * pushes enqueued by streak.service.ts ('streak-milestone') and
 * goal.service.ts ('goal-completed'), plus suppression-aware Reminder
 * delivery ('reminder-fire') enqueued by notification.service.ts. Runs as
 * its own process (`node dist/workers/notif.worker.js`) on VM2, separate
 * from the HTTP server.
 *
 * Requirements: 4.5, 5.5, 8.2, 8.3, 8.5
 */

import { Worker } from 'bullmq';
import type { Job } from 'bullmq';

import { getKnex } from '../db/client';
import {
  NOTIFICATION_QUEUE_NAME,
  deliverPushNotification,
  processReminderFire,
} from '../services/notification.service';
import type { ReminderFireJob } from '../services/notification.service';

interface StreakMilestoneJobData {
  type: 'streak-milestone';
  userId: string;
  trackerId: string;
  streak: number;
}

interface GoalCompletedJobData {
  userId: string;
  goalId: string;
  trackerId: string;
}

type NotificationJobData = StreakMilestoneJobData | GoalCompletedJobData | ReminderFireJob;

function getWorkerConnection(): { host: string; port: number } {
  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl) {
    const url = new URL(redisUrl);
    return { host: url.hostname, port: url.port ? Number(url.port) : 6379 };
  }
  return { host: '127.0.0.1', port: 6379 };
}

async function trackerName(trackerId: string): Promise<string> {
  const knex = getKnex();
  const row = (await knex('trackers').where({ id: trackerId }).select('name').first()) as
    | { name: string }
    | undefined;
  return row?.name ?? 'your tracker';
}

async function processJob(job: Job<NotificationJobData>): Promise<void> {
  switch (job.name) {
    case 'streak-milestone': {
      const data = job.data as StreakMilestoneJobData;
      await deliverPushNotification({
        userId: data.userId,
        title: 'Streak milestone! 🔥',
        body: `${await trackerName(data.trackerId)}: ${data.streak}-day streak.`,
      });
      return;
    }
    case 'goal-completed': {
      const data = job.data as GoalCompletedJobData;
      await deliverPushNotification({
        userId: data.userId,
        title: 'Goal completed! 🎉',
        body: `You reached your goal for ${await trackerName(data.trackerId)}.`,
      });
      return;
    }
    case 'reminder-fire': {
      await processReminderFire(job.data as ReminderFireJob);
      return;
    }
    default:
      return;
  }
}

export function startNotifWorker(): Worker<NotificationJobData> {
  return new Worker<NotificationJobData>(NOTIFICATION_QUEUE_NAME, processJob, {
    connection: getWorkerConnection(),
    // Kept at 1 on purpose: VM2 has 1 OCPU / 1GB total, shared with the
    // Express API and the other workers — a single concurrent job avoids
    // competing for memory (matches insight.worker.ts / export.worker.ts).
    concurrency: 1,
  });
}

if (require.main === module) {
  const worker = startNotifWorker();
  // eslint-disable-next-line no-console
  console.log('Notification worker started');

  worker.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`Notification job ${job?.id} failed:`, err);
  });
}
