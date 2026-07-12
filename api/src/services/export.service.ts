import fs from 'fs';
import path from 'path';

import { Queue } from 'bullmq';

import { getKnex } from '../db/client';
import type {
  ExportRequest,
  ExportRow,
  ExportResult,
  ExportJobStatus,
} from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYNC_EXPORT_LIMIT = 10_000;
export const EXPORT_QUEUE_NAME = 'export-large';

const CSV_HEADERS = ['Tracker name', 'Entry date', 'Entry value', 'Entry note', 'Category'] as const;

// ---------------------------------------------------------------------------
// Storage abstraction
// ---------------------------------------------------------------------------

/**
 * Minimal object-storage abstraction. On the 2-VM Oracle Free Tier
 * deployment this writes to a local directory served by Nginx (or, once
 * configured, swapped for an OCI Object Storage PUT — same signature).
 * Kept swappable so the export logic itself never depends on where bytes
 * end up.
 */
export interface ExportStorage {
  save(filename: string, content: string): Promise<{ downloadUrl: string }>;
  delete(filename: string): Promise<void>;
}

const LOCAL_EXPORT_DIR = process.env['EXPORT_STORAGE_DIR'] ?? '/tmp/lifetrack-exports';

export const localExportStorage: ExportStorage = {
  async save(filename, content) {
    await fs.promises.mkdir(LOCAL_EXPORT_DIR, { recursive: true });
    const filePath = path.join(LOCAL_EXPORT_DIR, filename);
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { downloadUrl: `/exports/files/${filename}` };
  },
  async delete(filename) {
    const filePath = path.join(LOCAL_EXPORT_DIR, filename);
    await fs.promises.rm(filePath, { force: true });
  },
};

let storage: ExportStorage = localExportStorage;

/** Test/deployment hook to swap in a different backend (e.g. OCI Object Storage). */
export function setExportStorage(impl: ExportStorage): void {
  storage = impl;
}

// ---------------------------------------------------------------------------
// Queue (large exports)
// ---------------------------------------------------------------------------

let exportQueue: Queue | null = null;

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

  return { ...base, maxRetriesPerRequest: 1, retryStrategy: () => null, connectTimeout: 2000 };
}

export function getExportQueue(): Queue {
  if (!exportQueue) {
    exportQueue = new Queue(EXPORT_QUEUE_NAME, { connection: getQueueConnection() });
  }
  return exportQueue;
}

// ---------------------------------------------------------------------------
// Row fetching (Property 18: date range filter)
// ---------------------------------------------------------------------------

interface RawExportRow {
  tracker_name: string;
  local_date: string;
  value_numeric: string | number | null;
  value_boolean: boolean | null;
  value_text: string | null;
  note: string | null;
  category_names: string | null; // comma-joined by the DB, or null
}

/**
 * Fetches Entries for export, applying the trackerId / date-range filters.
 * Every returned row satisfies `local_date >= startDate && local_date <= endDate`.
 *
 * Requirements: 10.1, 10.2
 */
export async function fetchExportRows(
  userId: string,
  filters: Pick<ExportRequest, 'trackerId' | 'startDate' | 'endDate'>,
): Promise<ExportRow[]> {
  const knex = getKnex();

  let query = knex('entries as e')
    .join('trackers as t', 't.id', 'e.tracker_id')
    .leftJoin('tracker_categories as tc', 'tc.tracker_id', 't.id')
    .leftJoin('categories as c', 'c.id', 'tc.category_id')
    .where('e.user_id', userId)
    .groupBy('e.id', 't.name', 'e.local_date', 'e.value_numeric', 'e.value_boolean', 'e.value_text', 'e.note')
    .select(
      't.name as tracker_name',
      'e.local_date',
      'e.value_numeric',
      'e.value_boolean',
      'e.value_text',
      'e.note',
      knex.raw('string_agg(c.name, \', \') as category_names'),
    );

  if (filters.trackerId) query = query.andWhere('e.tracker_id', filters.trackerId);
  if (filters.startDate) query = query.andWhere('e.local_date', '>=', filters.startDate);
  if (filters.endDate) query = query.andWhere('e.local_date', '<=', filters.endDate);

  const rows = (await query) as RawExportRow[];

  return rows.map((r) => ({
    trackerName: r.tracker_name,
    entryDate: r.local_date.slice(0, 10),
    entryValue:
      r.value_numeric !== null ? Number(r.value_numeric) : r.value_boolean !== null ? r.value_boolean : (r.value_text ?? ''),
    entryNote: r.note ?? '',
    category: r.category_names ?? '',
  }));
}

// ---------------------------------------------------------------------------
// Serializers (Property 19, 20, 21)
// ---------------------------------------------------------------------------

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Requirements: 10.5, 10.8
 */
export function serializeCsv(rows: ExportRow[]): string {
  const header = CSV_HEADERS.join(',');
  if (rows.length === 0) return `${header}\n`;

  const lines = rows.map((r) =>
    [
      csvEscape(r.trackerName),
      csvEscape(r.entryDate),
      csvEscape(String(r.entryValue)),
      csvEscape(r.entryNote),
      csvEscape(r.category),
    ].join(','),
  );

  return `${header}\n${lines.join('\n')}\n`;
}

/**
 * Requirements: 10.6, 10.8
 */
export function serializeJson(rows: ExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}

/**
 * Parses a JSON export back into ExportRow[]. Paired with serializeJson
 * this is the round-trip invariant (Property 20): every field must survive
 * export -> re-import unchanged.
 *
 * Requirements: 10.7
 */
export function parseJsonExport(json: string): ExportRow[] {
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid export JSON: expected an array');
  }
  return parsed as ExportRow[];
}

// ---------------------------------------------------------------------------
// generateExport — sync (<=10k) or enqueued (>10k)
// ---------------------------------------------------------------------------

/**
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.8, 10.9
 */
export async function generateExport(
  userId: string,
  req: ExportRequest,
): Promise<ExportResult | { jobId: string; status: 'processing' }> {
  const knex = getKnex();

  const [job] = (await knex('export_jobs')
    .insert({
      user_id: userId,
      format: req.format,
      tracker_id: req.trackerId ?? null,
      start_date: req.startDate ?? null,
      end_date: req.endDate ?? null,
      status: 'processing',
    })
    .returning('id')) as { id: string }[];

  const jobId = job!.id;

  const rows = await fetchExportRows(userId, req);

  if (rows.length > SYNC_EXPORT_LIMIT) {
    // Large export: hand off to the ExportWorker, respond immediately.
    const queue = getExportQueue();
    await queue.add('export', { jobId, userId, request: req }, { attempts: 2 });
    return { jobId, status: 'processing' };
  }

  // Small export: generate synchronously.
  try {
    const content = req.format === 'csv' ? serializeCsv(rows) : serializeJson(rows);
    const filename = `${jobId}.${req.format}`;
    const { downloadUrl } = await storage.save(filename, content);
    const generatedAt = new Date();

    await knex('export_jobs')
      .where({ id: jobId })
      .update({
        status: 'completed',
        entry_count: rows.length,
        download_url: downloadUrl,
        completed_at: generatedAt,
      });

    return {
      jobId,
      status: 'completed',
      downloadUrl,
      entryCount: rows.length,
      generatedAt: generatedAt.toISOString(),
    };
  } catch (err) {
    // No partial/corrupted file is left behind (Req 10.9).
    await storage.delete(`${jobId}.${req.format}`).catch(() => undefined);
    await knex('export_jobs')
      .where({ id: jobId })
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Unknown export failure',
      });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// getExportJobStatus
// ---------------------------------------------------------------------------

interface ExportJobRow {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  download_url: string | null;
  entry_count: number | null;
  error_message: string | null;
  completed_at: string | Date | null;
}

export async function getExportJobStatus(
  userId: string,
  jobId: string,
): Promise<ExportJobStatus | null> {
  const knex = getKnex();
  const row = (await knex('export_jobs')
    .where({ id: jobId, user_id: userId })
    .first()) as ExportJobRow | undefined;

  if (!row) return null;

  return {
    jobId: row.id,
    status: row.status,
    downloadUrl: row.download_url,
    entryCount: row.entry_count,
    errorMessage: row.error_message,
    generatedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}
