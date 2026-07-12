import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    -- Users
    CREATE TABLE users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      timezone      TEXT NOT NULL DEFAULT 'UTC',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Categories
    CREATE TABLE categories (
      id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name    TEXT NOT NULL,
      UNIQUE (user_id, name)
    );

    -- Trackers
    CREATE TABLE trackers (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
      data_type     TEXT NOT NULL CHECK (data_type IN ('numeric','boolean','text')),
      unit          TEXT,
      frequency     JSONB NOT NULL,
      valid_range   JSONB,
      is_habit      BOOLEAN NOT NULL DEFAULT false,
      grace_enabled BOOLEAN NOT NULL DEFAULT false,
      is_archived   BOOLEAN NOT NULL DEFAULT false,
      is_builtin    BOOLEAN NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_trackers_user ON trackers(user_id) WHERE NOT is_archived;

    -- Tracker <-> Category join table
    CREATE TABLE tracker_categories (
      tracker_id  UUID REFERENCES trackers(id) ON DELETE CASCADE,
      category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (tracker_id, category_id)
    );

    -- Entries
    CREATE TABLE entries (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tracker_id      UUID NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      value_numeric   NUMERIC,
      value_boolean   BOOLEAN,
      value_text      TEXT CHECK (char_length(value_text) <= 500),
      note            TEXT CHECK (char_length(note) <= 500),
      local_date      DATE NOT NULL,
      local_timestamp TIMESTAMPTZ NOT NULL,
      edit_timestamp  TIMESTAMPTZ,
      UNIQUE (tracker_id, local_date)
    );

    CREATE INDEX idx_entries_tracker_date ON entries(tracker_id, local_date DESC);

    -- Streaks (denormalised for fast dashboard reads)
    CREATE TABLE streaks (
      tracker_id          UUID PRIMARY KEY REFERENCES trackers(id) ON DELETE CASCADE,
      current_streak      INT NOT NULL DEFAULT 0,
      longest_streak      INT NOT NULL DEFAULT 0,
      last_completed_date DATE
    );

    -- Goals
    CREATE TABLE goals (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tracker_id   UUID NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
      target_value NUMERIC NOT NULL,
      direction    TEXT NOT NULL CHECK (direction IN ('ascending','descending')),
      deadline     DATE NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','expired')),
      progress_pct NUMERIC NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ,
      expired_at   TIMESTAMPTZ
    );

    -- Insights
    CREATE TABLE insights (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type         TEXT NOT NULL CHECK (type IN ('trend','correlation')),
      payload      JSONB NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_insights_user_generated ON insights(user_id, generated_at DESC);

    -- Reminders
    CREATE TABLE reminders (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tracker_id   UUID NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
      time_of_day  TIME NOT NULL,
      days_of_week SMALLINT[] NOT NULL,
      enabled      BOOLEAN NOT NULL DEFAULT true
    );

    -- Password reset tokens
    CREATE TABLE password_reset_tokens (
      token      TEXT PRIMARY KEY,
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      used_at    TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    DROP TABLE IF EXISTS password_reset_tokens;
    DROP TABLE IF EXISTS reminders;
    DROP INDEX IF EXISTS idx_insights_user_generated;
    DROP TABLE IF EXISTS insights;
    DROP TABLE IF EXISTS goals;
    DROP TABLE IF EXISTS streaks;
    DROP INDEX IF EXISTS idx_entries_tracker_date;
    DROP TABLE IF EXISTS entries;
    DROP TABLE IF EXISTS tracker_categories;
    DROP INDEX IF EXISTS idx_trackers_user;
    DROP TABLE IF EXISTS trackers;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS users;
  `);
}
