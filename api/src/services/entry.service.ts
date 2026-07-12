import { getKnex } from '../db/client';
import { recalculateStreak } from './streak.service';
import { updateGoalProgress } from './goal.service';
import type { Entry, ValidationError, ConflictError, NotFoundError, ValidRange } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_NOTE_LENGTH = 500;
const MAX_TEXT_VALUE_LENGTH = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogEntryRequest {
  value: number | boolean | string;
  note?: string;
  localDate: string; // YYYY-MM-DD, computed client-side from the user's local time
  localTimestamp: string; // ISO 8601
  confirmOverwrite?: boolean;
}

export interface EditEntryRequest {
  value?: number | boolean | string;
  note?: string;
}

export interface LogEntryResult {
  entry: Entry;
  noteTruncated: boolean;
}

interface TrackerRow {
  id: string;
  user_id: string;
  data_type: 'numeric' | 'boolean' | 'text';
  valid_range: ValidRange | string | null;
}

interface EntryRow {
  id: string;
  tracker_id: string;
  user_id: string;
  value_numeric: string | null;
  value_boolean: boolean | null;
  value_text: string | null;
  note: string | null;
  local_date: string;
  local_timestamp: string | Date;
  edit_timestamp: string | Date | null;
}

// ---------------------------------------------------------------------------
// Row <-> domain mapping
// ---------------------------------------------------------------------------

function extractValue(row: EntryRow): number | boolean | string {
  if (row.value_numeric !== null) return Number(row.value_numeric);
  if (row.value_boolean !== null) return row.value_boolean;
  return row.value_text ?? '';
}

function rowToEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    trackerId: row.tracker_id,
    userId: row.user_id,
    value: extractValue(row),
    note: row.note,
    localDate: row.local_date,
    localTimestamp: new Date(row.local_timestamp).toISOString(),
    editTimestamp: row.edit_timestamp ? new Date(row.edit_timestamp).toISOString() : null,
  };
}

function valueColumns(
  dataType: TrackerRow['data_type'],
  value: number | boolean | string,
): { value_numeric: number | null; value_boolean: boolean | null; value_text: string | null } {
  return {
    value_numeric: dataType === 'numeric' ? (value as number) : null,
    value_boolean: dataType === 'boolean' ? (value as boolean) : null,
    value_text: dataType === 'text' ? (value as string) : null,
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function parseValidRange(raw: ValidRange | string | null): ValidRange | null {
  if (raw === null) return null;
  return typeof raw === 'string' ? (JSON.parse(raw) as ValidRange) : raw;
}

/**
 * Triggers the two side effects that must follow every successful Entry
 * save: Streak recalculation (Req 3.9, 4.1-4.3) and Goal progress update
 * (Req 5.3-5.5, 5.9). Each is isolated in its own try/catch so a failure in
 * one (or both) never prevents the Entry itself from being saved and
 * returned to the caller.
 */
async function runPostSaveHooks(userId: string, trackerId: string): Promise<void> {
  await Promise.all([
    recalculateStreak(userId, trackerId).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error(`Streak recalculation failed for tracker ${trackerId}:`, err);
    }),
    updateGoalProgress(trackerId).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error(`Goal progress update failed for tracker ${trackerId}:`, err);
    }),
  ]);
}

function validateValue(
  tracker: TrackerRow,
  value: number | boolean | string,
): string | null {
  switch (tracker.data_type) {
    case 'numeric': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return 'Value must be a number';
      }
      const range = parseValidRange(tracker.valid_range);
      if (range && (value < range.min || value > range.max)) {
        return `Value must be between ${range.min} and ${range.max}`;
      }
      return null;
    }
    case 'boolean':
      if (typeof value !== 'boolean') {
        return 'Value must be true or false';
      }
      return null;
    case 'text':
      if (typeof value !== 'string') {
        return 'Value must be text';
      }
      if (value.length > MAX_TEXT_VALUE_LENGTH) {
        return `Text value must be at most ${MAX_TEXT_VALUE_LENGTH} characters`;
      }
      return null;
    default:
      return 'Unknown tracker data type';
  }
}

// ---------------------------------------------------------------------------
// logEntry
// ---------------------------------------------------------------------------

/**
 * Logs an Entry for a Tracker on the user's local calendar day.
 *
 * Steps:
 *  1. Look up the tracker (must belong to the user).
 *  2. Validate the value against the tracker's data type / valid range.
 *  3. Truncate an over-long note to exactly 500 chars (Req 3.8 / Property 9).
 *  4. If an Entry already exists for that tracker+day:
 *       - without confirmOverwrite  -> ConflictError with existingEntryId (Req 3.3)
 *       - with confirmOverwrite     -> update value/note, set edit_timestamp (Req 3.4)
 *  5. Otherwise insert a new Entry.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8
 */
export async function logEntry(
  userId: string,
  trackerId: string,
  req: LogEntryRequest,
): Promise<LogEntryResult | ValidationError | ConflictError | NotFoundError> {
  const knex = getKnex();

  const tracker = (await knex('trackers')
    .where({ id: trackerId, user_id: userId })
    .select('id', 'user_id', 'data_type', 'valid_range')
    .first()) as TrackerRow | undefined;

  if (!tracker) {
    return { error: 'NOT_FOUND', message: 'Tracker not found' } satisfies NotFoundError;
  }

  // ---- Validate value ----
  const valueError = validateValue(tracker, req.value);
  if (valueError) {
    return {
      error: 'VALIDATION_ERROR',
      message: valueError,
      fields: { value: valueError },
    } satisfies ValidationError;
  }

  // ---- Truncate note (Req 3.8 / Property 9) ----
  let note: string | null = req.note ?? null;
  let noteTruncated = false;
  if (note !== null && note.length > MAX_NOTE_LENGTH) {
    note = note.slice(0, MAX_NOTE_LENGTH);
    noteTruncated = true;
  }

  const valueCols = valueColumns(tracker.data_type, req.value);

  // ---- Check for an existing Entry on this tracker+day ----
  const existing = (await knex('entries')
    .where({ tracker_id: trackerId, local_date: req.localDate })
    .select('id')
    .first()) as { id: string } | undefined;

  if (existing) {
    if (!req.confirmOverwrite) {
      return {
        error: 'CONFLICT',
        message: 'An entry already exists for this tracker today',
        existingEntryId: existing.id,
      } satisfies ConflictError;
    }

    // ---- Overwrite confirmed: update in place, keep original timestamp ----
    const [updated] = (await knex('entries')
      .where({ id: existing.id })
      .update({
        ...valueCols,
        note,
        edit_timestamp: new Date(),
      })
      .returning('*')) as EntryRow[];

    await runPostSaveHooks(userId, trackerId);
    return { entry: rowToEntry(updated!), noteTruncated };
  }

  // ---- Insert new Entry ----
  const [inserted] = (await knex('entries')
    .insert({
      tracker_id: trackerId,
      user_id: userId,
      ...valueCols,
      note,
      local_date: req.localDate,
      local_timestamp: req.localTimestamp,
    })
    .returning('*')) as EntryRow[];

  await runPostSaveHooks(userId, trackerId);
  return { entry: rowToEntry(inserted!), noteTruncated };
}

// ---------------------------------------------------------------------------
// listEntries
// ---------------------------------------------------------------------------

export interface ListEntriesOptions {
  start?: string; // YYYY-MM-DD
  end?: string; // YYYY-MM-DD
  limit?: number;
  offset?: number;
}

export async function listEntries(
  userId: string,
  trackerId: string,
  options: ListEntriesOptions = {},
): Promise<Entry[]> {
  const knex = getKnex();

  let query = knex('entries').where({ tracker_id: trackerId, user_id: userId });

  if (options.start) query = query.andWhere('local_date', '>=', options.start);
  if (options.end) query = query.andWhere('local_date', '<=', options.end);

  query = query.orderBy('local_date', 'desc');

  if (options.limit) query = query.limit(options.limit);
  if (options.offset) query = query.offset(options.offset);

  const rows = (await query) as EntryRow[];
  return rows.map(rowToEntry);
}

// ---------------------------------------------------------------------------
// editEntry
// ---------------------------------------------------------------------------

/**
 * Edits a past Entry's value and/or note. Always records an edit_timestamp
 * alongside the original local_timestamp (Req 3.6).
 *
 * Requirements: 3.6, 3.7, 3.8
 */
export async function editEntry(
  userId: string,
  trackerId: string,
  entryId: string,
  updates: EditEntryRequest,
): Promise<LogEntryResult | ValidationError | NotFoundError> {
  const knex = getKnex();

  const tracker = (await knex('trackers')
    .where({ id: trackerId, user_id: userId })
    .select('id', 'user_id', 'data_type', 'valid_range')
    .first()) as TrackerRow | undefined;

  if (!tracker) {
    return { error: 'NOT_FOUND', message: 'Tracker not found' } satisfies NotFoundError;
  }

  const patch: Record<string, unknown> = { edit_timestamp: new Date() };
  let noteTruncated = false;

  if (updates.value !== undefined) {
    const valueError = validateValue(tracker, updates.value);
    if (valueError) {
      return {
        error: 'VALIDATION_ERROR',
        message: valueError,
        fields: { value: valueError },
      } satisfies ValidationError;
    }
    Object.assign(patch, valueColumns(tracker.data_type, updates.value));
  }

  if (updates.note !== undefined) {
    let note = updates.note;
    if (note.length > MAX_NOTE_LENGTH) {
      note = note.slice(0, MAX_NOTE_LENGTH);
      noteTruncated = true;
    }
    patch['note'] = note;
  }

  const rows = (await knex('entries')
    .where({ id: entryId, tracker_id: trackerId, user_id: userId })
    .update(patch)
    .returning('*')) as EntryRow[];

  const updated = rows[0];
  if (!updated) {
    return { error: 'NOT_FOUND', message: 'Entry not found' } satisfies NotFoundError;
  }

  await runPostSaveHooks(userId, trackerId);
  return { entry: rowToEntry(updated), noteTruncated };
}
