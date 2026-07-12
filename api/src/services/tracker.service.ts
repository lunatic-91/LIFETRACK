import { getKnex } from '../db/client';
import type {
  Tracker,
  TrackerDataType,
  TrackerFrequency,
  ValidRange,
  ValidationError,
  LimitError,
  ConflictError,
  NotFoundError,
} from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ACTIVE_TRACKERS = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateTrackerRequest {
  name: string;
  dataType: TrackerDataType;
  unit?: string;
  frequency: TrackerFrequency;
  categories?: string[];
  validRange?: ValidRange;
  isHabit?: boolean;
  graceEnabled?: boolean;
}

export interface UpdateTrackerRequest {
  name?: string;
  unit?: string;
  frequency?: TrackerFrequency;
  validRange?: ValidRange;
  isHabit?: boolean;
  graceEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// Row <-> domain mapping
// ---------------------------------------------------------------------------

interface TrackerRow {
  id: string;
  user_id: string;
  name: string;
  data_type: TrackerDataType;
  unit: string | null;
  frequency: TrackerFrequency | string;
  valid_range: ValidRange | string | null;
  is_habit: boolean;
  grace_enabled: boolean;
  is_archived: boolean;
  is_builtin: boolean;
  created_at: string | Date;
}

/**
 * The pg driver already deserializes JSONB columns before knex sees them, so
 * `valid_range` arrives as an object (or null) — never as JSON text. This
 * only guards against the rare case of a raw string sneaking through (e.g.
 * a test double), and is safe because valid_range is never itself a string.
 */
function parseJsonbColumn<T>(value: T | string | null): T | null {
  if (value === null) return null;
  return typeof value === 'string' ? (JSON.parse(value) as T) : value;
}

function rowToTracker(row: TrackerRow): Tracker {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    dataType: row.data_type,
    unit: row.unit,
    // frequency can legitimately BE a string ('daily' | 'weekly'), already
    // deserialized by pg — never re-parse it as JSON text.
    frequency: row.frequency as TrackerFrequency,
    validRange: parseJsonbColumn<ValidRange>(row.valid_range),
    isHabit: row.is_habit,
    graceEnabled: row.grace_enabled,
    isArchived: row.is_archived,
    isBuiltin: row.is_builtin,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isValidName(name: unknown): name is string {
  return typeof name === 'string' && name.length >= 1 && name.length <= 100;
}

// ---------------------------------------------------------------------------
// createTracker
// ---------------------------------------------------------------------------

/**
 * Creates a new Tracker for a user.
 *
 * Steps:
 *  1. Validate name (1-100 chars) and required fields.
 *  2. Enforce the 50-active-tracker limit (Req 2.9, 2.10).
 *  3. Insert the tracker row; link any given category names (creating
 *     categories on the fly, Req 2.3).
 *  4. Return the created Tracker.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.9, 2.10
 */
export async function createTracker(
  userId: string,
  req: CreateTrackerRequest,
): Promise<Tracker | ValidationError | LimitError> {
  if (!isValidName(req.name)) {
    return {
      error: 'VALIDATION_ERROR',
      message: 'A tracker name of 1-100 characters is required',
      fields: { name: 'Name must be between 1 and 100 characters' },
    } satisfies ValidationError;
  }

  const knex = getKnex();

  // ---- 2. Enforce active tracker limit ----
  const countRows = (await knex('trackers')
    .where({ user_id: userId, is_archived: false })
    .count<{ count: string }[]>('id as count')) as { count: string }[];

  const activeCount = Number(countRows[0]?.count ?? 0);

  if (activeCount >= MAX_ACTIVE_TRACKERS) {
    return {
      error: 'LIMIT_ERROR',
      message: `Active tracker limit of ${MAX_ACTIVE_TRACKERS} has been reached`,
    } satisfies LimitError;
  }

  // ---- 3. Insert tracker ----
  const [inserted] = (await knex('trackers')
    .insert({
      user_id: userId,
      name: req.name,
      data_type: req.dataType,
      unit: req.unit ?? null,
      frequency: JSON.stringify(req.frequency),
      valid_range: req.validRange ? JSON.stringify(req.validRange) : null,
      is_habit: req.isHabit ?? false,
      grace_enabled: req.graceEnabled ?? false,
    })
    .returning('*')) as TrackerRow[];

  const tracker = rowToTracker(inserted!);

  // ---- Link categories (create on the fly) ----
  if (req.categories && req.categories.length > 0) {
    await linkCategories(userId, tracker.id, req.categories);
  }

  return tracker;
}

async function linkCategories(userId: string, trackerId: string, names: string[]): Promise<void> {
  const knex = getKnex();

  for (const name of names) {
    const existing = (await knex('categories')
      .where({ user_id: userId, name })
      .select('id')
      .first()) as { id: string } | undefined;

    const categoryId =
      existing?.id ??
      ((
        (await knex('categories')
          .insert({ user_id: userId, name })
          .returning('id')) as { id: string }[]
      )[0]!.id);

    await knex('tracker_categories')
      .insert({ tracker_id: trackerId, category_id: categoryId })
      .onConflict(['tracker_id', 'category_id'])
      .ignore();
  }
}

// ---------------------------------------------------------------------------
// listTrackers
// ---------------------------------------------------------------------------

/**
 * Lists a user's Trackers. By default excludes archived Trackers so the
 * Dashboard only shows active ones (Req 2.5).
 */
export async function listTrackers(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Tracker[]> {
  const knex = getKnex();
  let query = knex('trackers').where({ user_id: userId });

  if (!options.includeArchived) {
    query = query.andWhere({ is_archived: false });
  }

  const rows = (await query.orderBy('created_at', 'asc')) as TrackerRow[];
  return rows.map(rowToTracker);
}

// ---------------------------------------------------------------------------
// updateTracker
// ---------------------------------------------------------------------------

/**
 * Updates a Tracker's configuration. Historical Entries are never touched —
 * this only changes the `trackers` row itself (Req 2.4).
 *
 * Requirements: 2.4
 */
export async function updateTracker(
  userId: string,
  trackerId: string,
  updates: UpdateTrackerRequest,
): Promise<Tracker | ValidationError | NotFoundError> {
  if (updates.name !== undefined && !isValidName(updates.name)) {
    return {
      error: 'VALIDATION_ERROR',
      message: 'A tracker name of 1-100 characters is required',
      fields: { name: 'Name must be between 1 and 100 characters' },
    } satisfies ValidationError;
  }

  const knex = getKnex();

  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch['name'] = updates.name;
  if (updates.unit !== undefined) patch['unit'] = updates.unit;
  if (updates.frequency !== undefined) patch['frequency'] = JSON.stringify(updates.frequency);
  if (updates.validRange !== undefined) patch['valid_range'] = JSON.stringify(updates.validRange);
  if (updates.isHabit !== undefined) patch['is_habit'] = updates.isHabit;
  if (updates.graceEnabled !== undefined) patch['grace_enabled'] = updates.graceEnabled;

  const rows = (await knex('trackers')
    .where({ id: trackerId, user_id: userId })
    .update(patch)
    .returning('*')) as TrackerRow[];

  const updated = rows[0];
  if (!updated) {
    return { error: 'NOT_FOUND', message: 'Tracker not found' } satisfies NotFoundError;
  }

  return rowToTracker(updated);
}

// ---------------------------------------------------------------------------
// archiveTracker
// ---------------------------------------------------------------------------

/**
 * Archives a Tracker: hides it from the Dashboard while preserving all
 * associated Entries and Goals (Req 2.5). Archived trackers cannot be
 * deleted while archived (Req 2.6) — enforced in deleteTracker below.
 *
 * Requirements: 2.5, 2.6
 */
export async function archiveTracker(
  userId: string,
  trackerId: string,
): Promise<void | NotFoundError> {
  const knex = getKnex();

  const rows = (await knex('trackers')
    .where({ id: trackerId, user_id: userId })
    .update({ is_archived: true })
    .returning('id')) as { id: string }[];

  if (rows.length === 0) {
    return { error: 'NOT_FOUND', message: 'Tracker not found' } satisfies NotFoundError;
  }
}

// ---------------------------------------------------------------------------
// deleteTracker
// ---------------------------------------------------------------------------

/**
 * Permanently deletes a non-archived Tracker and all associated Entries and
 * Goals (ON DELETE CASCADE handles the fan-out at the DB level).
 *
 * Archived trackers are blocked from deletion (Req 2.6) — the caller must
 * unarchive first if they want to delete.
 *
 * Requirements: 2.6, 2.7
 */
export async function deleteTracker(
  userId: string,
  trackerId: string,
): Promise<void | NotFoundError | ConflictError> {
  const knex = getKnex();

  const tracker = (await knex('trackers')
    .where({ id: trackerId, user_id: userId })
    .select('id', 'is_archived')
    .first()) as { id: string; is_archived: boolean } | undefined;

  if (!tracker) {
    return { error: 'NOT_FOUND', message: 'Tracker not found' } satisfies NotFoundError;
  }

  if (tracker.is_archived) {
    return {
      error: 'CONFLICT',
      message: 'Cannot delete an archived tracker; unarchive it first',
    } satisfies ConflictError;
  }

  // ON DELETE CASCADE on entries, goals, streaks, reminders, tracker_categories
  await knex('trackers').where({ id: trackerId, user_id: userId }).delete();
}
