/**
 * Property-based tests for tracker.service — cascade delete.
 * Feature: lifetrack-app
 *
 * These are UNIT tests. getKnex() is mocked to simulate a table-store with
 * ON DELETE CASCADE semantics so the property is checked against in-memory
 * state rather than a real database.
 */

import * as fc from 'fast-check';

import { arbitraryTracker } from './generators';

// ---------------------------------------------------------------------------
// In-memory fake tables + a minimal Knex-like query builder
// ---------------------------------------------------------------------------

interface FakeDb {
  trackers: Map<string, { id: string; user_id: string; is_archived: boolean }>;
  entries: Map<string, { id: string; tracker_id: string }>;
  goals: Map<string, { id: string; tracker_id: string }>;
}

function makeFakeKnex(db: FakeDb) {
  return (table: 'trackers' | 'entries' | 'goals') => {
    const state: { whereClause: Record<string, unknown> } = { whereClause: {} };

    const builder = {
      where(clause: Record<string, unknown>) {
        state.whereClause = { ...state.whereClause, ...clause };
        return builder;
      },
      select() {
        return builder;
      },
      async first() {
        if (table !== 'trackers') return undefined;
        for (const row of db.trackers.values()) {
          if (matches(row, state.whereClause)) return row;
        }
        return undefined;
      },
      async delete() {
        if (table === 'trackers') {
          for (const [id, row] of db.trackers) {
            if (matches(row, state.whereClause)) {
              db.trackers.delete(id);
              // Simulate ON DELETE CASCADE
              for (const [eid, e] of db.entries) {
                if (e.tracker_id === id) db.entries.delete(eid);
              }
              for (const [gid, g] of db.goals) {
                if (g.tracker_id === id) db.goals.delete(gid);
              }
            }
          }
        }
        return undefined;
      },
    };
    return builder;
  };
}

function matches(row: Record<string, unknown>, clause: Record<string, unknown>): boolean {
  return Object.entries(clause).every(([k, v]) => row[k] === v);
}

jest.mock('../../db/client', () => ({
  getKnex: jest.fn(),
}));

import { deleteTracker } from '../../services/tracker.service';
import { getKnex } from '../../db/client';

// ---------------------------------------------------------------------------
// Property 7: Cascade delete removes tracker and all associated data
// Validates: Requirements 2.7
// ---------------------------------------------------------------------------

describe('Property 7: Cascade delete removes tracker and all associated data', () => {
  // Feature: lifetrack-app, Property 7: Cascade delete removes tracker and all associated data

  test('for any non-archived tracker with entries/goals, delete removes all rows', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryTracker(),
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        async (_trackerConfig, entryCount, goalCount) => {
          const userId = 'user-1';
          const trackerId = 'tracker-1';

          const db: FakeDb = {
            trackers: new Map([[trackerId, { id: trackerId, user_id: userId, is_archived: false }]]),
            entries: new Map(
              Array.from({ length: entryCount }, (_, i) => [
                `entry-${i}`,
                { id: `entry-${i}`, tracker_id: trackerId },
              ]),
            ),
            goals: new Map(
              Array.from({ length: goalCount }, (_, i) => [
                `goal-${i}`,
                { id: `goal-${i}`, tracker_id: trackerId },
              ]),
            ),
          };

          (getKnex as jest.Mock).mockReturnValue(makeFakeKnex(db) as unknown);

          const result = await deleteTracker(userId, trackerId);

          expect(result).toBeUndefined();
          expect(db.trackers.has(trackerId)).toBe(false);
          expect([...db.entries.values()].some((e) => e.tracker_id === trackerId)).toBe(false);
          expect([...db.goals.values()].some((g) => g.tracker_id === trackerId)).toBe(false);
        },
      ),
    );
  });

  test('archived trackers are rejected with CONFLICT and are not deleted', async () => {
    const userId = 'user-1';
    const trackerId = 'tracker-archived';

    const db: FakeDb = {
      trackers: new Map([[trackerId, { id: trackerId, user_id: userId, is_archived: true }]]),
      entries: new Map(),
      goals: new Map(),
    };

    (getKnex as jest.Mock).mockReturnValue(makeFakeKnex(db) as unknown);

    const result = await deleteTracker(userId, trackerId);

    expect(result).toEqual({
      error: 'CONFLICT',
      message: 'Cannot delete an archived tracker; unarchive it first',
    });
    expect(db.trackers.has(trackerId)).toBe(true);
  });
});
