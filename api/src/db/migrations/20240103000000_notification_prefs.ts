import type { Knex } from 'knex';

/**
 * Adds the per-user global notification toggle (Req 8.4: "enable or disable
 * Reminders globally ... without deleting the Reminder configuration").
 * Kept as its own migration rather than folded into the initial schema
 * since the `reminders` table already shipped in task 10's predecessor
 * migrations without it.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    ALTER TABLE users
      ADD COLUMN notifications_enabled BOOLEAN NOT NULL DEFAULT true;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS notifications_enabled;
  `);
}
