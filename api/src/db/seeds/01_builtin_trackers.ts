import type { Knex } from 'knex';

/**
 * Seeds built-in Mood and Energy trackers for a given user.
 * Uses INSERT ... ON CONFLICT DO NOTHING so repeated calls are idempotent.
 *
 * Validates: Requirements 7.1, 7.2
 */
export async function seedBuiltinTrackers(knex: Knex, userId: string): Promise<void> {
  const trackers = [
    {
      user_id: userId,
      name: 'Mood',
      data_type: 'numeric',
      unit: '1-10',
      frequency: JSON.stringify({ type: 'daily' }),
      valid_range: JSON.stringify({ min: 1, max: 10 }),
      is_builtin: true,
      is_habit: false,
      grace_enabled: false,
      is_archived: false,
    },
    {
      user_id: userId,
      name: 'Energy',
      data_type: 'numeric',
      unit: '1-10',
      frequency: JSON.stringify({ type: 'daily' }),
      valid_range: JSON.stringify({ min: 1, max: 10 }),
      is_builtin: true,
      is_habit: false,
      grace_enabled: false,
      is_archived: false,
    },
  ];

  await knex.raw(
    `
    INSERT INTO trackers
      (user_id, name, data_type, unit, frequency, valid_range,
       is_builtin, is_habit, grace_enabled, is_archived)
    SELECT
      t.user_id, t.name, t.data_type, t.unit,
      t.frequency::jsonb, t.valid_range::jsonb,
      t.is_builtin, t.is_habit, t.grace_enabled, t.is_archived
    FROM json_to_recordset(?) AS t(
      user_id       uuid,
      name          text,
      data_type     text,
      unit          text,
      frequency     text,
      valid_range   text,
      is_builtin    boolean,
      is_habit      boolean,
      grace_enabled boolean,
      is_archived   boolean
    )
    ON CONFLICT DO NOTHING
    `,
    [JSON.stringify(trackers)],
  );
}

/**
 * Standard Knex seed entry point.
 * Built-in trackers are created per-user (called by registerUser after account creation),
 * so this global seed is intentionally a no-op.
 */
export async function seed(_knex: Knex): Promise<void> {
  // no-op: built-in trackers are seeded per-user via seedBuiltinTrackers()
}
