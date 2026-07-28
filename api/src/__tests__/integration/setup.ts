/**
 * Shared setup for integration tests. Uses the REAL getKnex()/getRedis()
 * singletons (NODE_ENV=test selects the `test` Knex config pointing at
 * TEST_DB_URL) — nothing here is mocked, unlike the unit/property tests.
 *
 * Requires:
 *  - A reachable Postgres with migrations already applied
 *    (NODE_ENV=test npm run migrate)
 *  - A reachable Redis
 */

import { getKnex, getRedis } from '../../db/client';

const TABLES_IN_FK_ORDER = [
  'export_jobs',
  'password_reset_tokens',
  'reminders',
  'insights',
  'goals',
  'streaks',
  'entries',
  'tracker_categories',
  'trackers',
  'categories',
  'users',
];

export async function truncateAllTables(): Promise<void> {
  const knex = getKnex();
  await knex.raw(`TRUNCATE TABLE ${TABLES_IN_FK_ORDER.join(', ')} RESTART IDENTITY CASCADE`);
}

export async function flushRedis(): Promise<void> {
  const redis = getRedis();
  await redis.flushdb();
}

export async function closeConnections(): Promise<void> {
  await getKnex().destroy();
  getRedis().disconnect();
}
