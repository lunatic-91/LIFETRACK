import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    -- Export jobs (tracks both synchronous and BullMQ-backed async exports
    -- so GET /exports/:jobId has something durable to poll against).
    CREATE TABLE export_jobs (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      format        TEXT NOT NULL CHECK (format IN ('csv','json')),
      tracker_id    UUID REFERENCES trackers(id) ON DELETE CASCADE,
      start_date    DATE,
      end_date      DATE,
      status        TEXT NOT NULL DEFAULT 'processing'
                       CHECK (status IN ('processing','completed','failed')),
      entry_count   INT,
      download_url  TEXT,
      error_message TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at  TIMESTAMPTZ
    );

    CREATE INDEX idx_export_jobs_user ON export_jobs(user_id, created_at DESC);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    DROP INDEX IF EXISTS idx_export_jobs_user;
    DROP TABLE IF EXISTS export_jobs;
  `);
}
