/**
 * Export Worker — processes large (>10,000 entries) export jobs enqueued by
 * generateExport(). Runs as its own process on VM2, separate from the HTTP
 * server, since generating a big CSV/JSON file can take up to the 60s SLA
 * (Req 10.4).
 *
 * Requirements: 10.4, 10.9
 */

import { Worker } from 'bullmq';

import { getKnex } from '../db/client';
import {
  fetchExportRows,
  serializeCsv,
  serializeJson,
  localExportStorage,
} from '../services/export.service';
import type { ExportRequest } from '../types';

interface ExportJobData {
  jobId: string;
  userId: string;
  request: ExportRequest;
}

function getWorkerConnection(): { host: string; port: number } {
  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl) {
    const url = new URL(redisUrl);
    return { host: url.hostname, port: url.port ? Number(url.port) : 6379 };
  }
  return { host: '127.0.0.1', port: 6379 };
}

export function startExportWorker(): Worker<ExportJobData> {
  return new Worker<ExportJobData>(
    'export-large',
    async (job) => {
      const { jobId, userId, request } = job.data;
      const knex = getKnex();

      try {
        const rows = await fetchExportRows(userId, request);
        const content = request.format === 'csv' ? serializeCsv(rows) : serializeJson(rows);
        const filename = `${jobId}.${request.format}`;
        const { downloadUrl } = await localExportStorage.save(filename, content);

        await knex('export_jobs')
          .where({ id: jobId })
          .update({
            status: 'completed',
            entry_count: rows.length,
            download_url: downloadUrl,
            completed_at: new Date(),
          });
      } catch (err) {
        // No partial file survives a failure (Req 10.9).
        await localExportStorage
          .delete(`${jobId}.${request.format}`)
          .catch(() => undefined);
        await knex('export_jobs')
          .where({ id: jobId })
          .update({
            status: 'failed',
            error_message: err instanceof Error ? err.message : 'Unknown export failure',
          });
        throw err;
      }
    },
    {
      connection: getWorkerConnection(),
      // 1 OCPU / 1GB shared with the API on VM2 — one export at a time.
      concurrency: 1,
    },
  );
}

if (require.main === module) {
  const worker = startExportWorker();
  // eslint-disable-next-line no-console
  console.log('Export worker started');

  worker.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`Export job ${job?.id} failed:`, err);
  });
}
