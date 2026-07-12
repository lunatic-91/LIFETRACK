/**
 * Property-based tests for entry.service — note truncation.
 * Feature: lifetrack-app
 *
 * UNIT tests. getKnex() is mocked with an in-memory fake table so the
 * property is checked against controlled state.
 */

import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// In-memory fake Postgres for a single numeric tracker with no valid_range
// ---------------------------------------------------------------------------

interface FakeEntryRow {
  id: string;
  tracker_id: string;
  user_id: string;
  value_numeric: number | null;
  value_boolean: boolean | null;
  value_text: string | null;
  note: string | null;
  local_date: string;
  local_timestamp: string;
  edit_timestamp: string | null;
}

function makeFakeKnex(trackerRow: Record<string, unknown>, entries: Map<string, FakeEntryRow>) {
  let idCounter = 0;

  return (table: 'trackers' | 'entries') => {
    const state: { whereClause: Record<string, unknown> } = { whereClause: {} };

    const builder: Record<string, unknown> = {
      where(clause: Record<string, unknown>) {
        state.whereClause = { ...state.whereClause, ...clause };
        return builder;
      },
      select() {
        return builder;
      },
      async first() {
        if (table === 'trackers') {
          return matchesAll(trackerRow, state.whereClause) ? trackerRow : undefined;
        }
        for (const row of entries.values()) {
          if (matchesAll(row as unknown as Record<string, unknown>, state.whereClause)) return row;
        }
        return undefined;
      },
      insert(data: Record<string, unknown>) {
        const id = `entry-${idCounter++}`;
        const row = { id, ...data } as FakeEntryRow;
        return {
          async returning() {
            entries.set(id, row);
            return [row];
          },
        };
      },
      update(patch: Record<string, unknown>) {
        return {
          async returning() {
            const updated: FakeEntryRow[] = [];
            for (const [id, row] of entries) {
              if (matchesAll(row as unknown as Record<string, unknown>, state.whereClause)) {
                const merged = { ...row, ...patch } as FakeEntryRow;
                entries.set(id, merged);
                updated.push(merged);
              }
            }
            return updated;
          },
        };
      },
    };
    return builder;
  };
}

function matchesAll(row: Record<string, unknown>, clause: Record<string, unknown>): boolean {
  return Object.entries(clause).every(([k, v]) => row[k] === v);
}

jest.mock('../../db/client', () => ({ getKnex: jest.fn() }));

import { logEntry } from '../../services/entry.service';
import { getKnex } from '../../db/client';

// ---------------------------------------------------------------------------
// Property 9: Note truncation to exactly 500 characters
// Validates: Requirements 3.8
// ---------------------------------------------------------------------------

describe('Property 9: Note truncation to exactly 500 characters', () => {
  // Feature: lifetrack-app, Property 9: Note truncation to exactly 500 characters

  test('for any note longer than 500 chars, stored note is truncated to exactly 500 and flagged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 501, maxLength: 2000 }),
        fc.integer({ min: 0, max: 1000 }),
        async (note, value) => {
          const trackerRow = {
            id: 'tracker-1',
            user_id: 'user-1',
            data_type: 'numeric',
            valid_range: null,
          };
          const entries = new Map<string, FakeEntryRow>();
          (getKnex as jest.Mock).mockReturnValue(makeFakeKnex(trackerRow, entries) as unknown);

          const result = await logEntry('user-1', 'tracker-1', {
            value,
            note,
            localDate: '2026-07-12',
            localTimestamp: '2026-07-12T10:00:00.000Z',
          });

          expect('entry' in result).toBe(true);
          const logResult = result as { entry: { note: string | null }; noteTruncated: boolean };
          expect(logResult.entry.note).toHaveLength(500);
          expect(logResult.entry.note).toBe(note.slice(0, 500));
          expect(logResult.noteTruncated).toBe(true);
        },
      ),
    );
  });

  test('notes of 500 chars or fewer are stored unchanged and not flagged', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 0, maxLength: 500 }), async (note) => {
        const trackerRow = {
          id: 'tracker-1',
          user_id: 'user-1',
          data_type: 'numeric',
          valid_range: null,
        };
        const entries = new Map<string, FakeEntryRow>();
        (getKnex as jest.Mock).mockReturnValue(makeFakeKnex(trackerRow, entries) as unknown);

        const result = await logEntry('user-1', 'tracker-1', {
          value: 5,
          note,
          localDate: '2026-07-12',
          localTimestamp: '2026-07-12T10:00:00.000Z',
        });

        expect('entry' in result).toBe(true);
        const logResult = result as { entry: { note: string | null }; noteTruncated: boolean };
        expect(logResult.entry.note).toBe(note);
        expect(logResult.noteTruncated).toBe(false);
      }),
    );
  });
});
