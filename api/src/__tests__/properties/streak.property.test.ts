/**
 * Property-based tests for streak.service — streak calculation and
 * milestone notification enqueueing.
 * Feature: lifetrack-app
 *
 * These are UNIT tests. getKnex()/getRedis() and BullMQ's `Queue` are
 * mocked so properties are checked against controlled in-memory state.
 */

import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mock BullMQ — capture every job added to any Queue instance
// ---------------------------------------------------------------------------

const mockAdd = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: mockAdd })),
}));

// ---------------------------------------------------------------------------
// Mock db/client — provides controllable getKnex() / getRedis()
// ---------------------------------------------------------------------------

interface FakeTrackerRow {
  id: string;
  user_id: string;
  is_habit: boolean;
  grace_enabled: boolean;
  frequency: string;
  created_at: string;
}

interface FakeEntryRow {
  local_date: string;
}

interface FakeStreakRow {
  tracker_id: string;
  current_streak: number;
  longest_streak: number;
  last_completed_date: string | null;
}

function matches(row: Record<string, unknown>, clause: Record<string, unknown>): boolean {
  return Object.entries(clause).every(([k, v]) => row[k] === v);
}

function makeFakeKnex(
  trackers: FakeTrackerRow[],
  entriesByTracker: Map<string, FakeEntryRow[]>,
  streaks: Map<string, FakeStreakRow>,
) {
  return (table: 'trackers' | 'entries' | 'streaks') => {
    const state: { whereClause: Record<string, unknown>; ordered: boolean } = {
      whereClause: {},
      ordered: false,
    };

    const runQuery = async (): Promise<unknown> => {
      if (table === 'entries') {
        const trackerId = state.whereClause['tracker_id'] as string;
        const list = (entriesByTracker.get(trackerId) ?? []).slice();
        if (state.ordered) {
          list.sort((a, b) =>
            a.local_date < b.local_date ? -1 : a.local_date > b.local_date ? 1 : 0,
          );
        }
        return list;
      }
      return [];
    };

    const builder = {
      where(clause: Record<string, unknown>) {
        state.whereClause = { ...state.whereClause, ...clause };
        return builder;
      },
      select() {
        return builder;
      },
      orderBy() {
        state.ordered = true;
        return builder;
      },
      async first() {
        if (table === 'trackers') {
          return trackers.find((t) =>
            matches(t as unknown as Record<string, unknown>, state.whereClause),
          );
        }
        if (table === 'streaks') {
          const trackerId = state.whereClause['tracker_id'] as string;
          return streaks.get(trackerId);
        }
        return undefined;
      },
      insert(row: FakeStreakRow) {
        return {
          onConflict() {
            return {
              async merge() {
                streaks.set(row.tracker_id, row);
              },
            };
          },
        };
      },
      // Makes `await knex('entries').where(...).select(...).orderBy(...)`
      // work without an explicit `.first()`/`.returning()` terminator.
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    return builder;
  };
}

const mockKnexFn = jest.fn();

jest.mock('../../db/client', () => ({
  getKnex: () => mockKnexFn,
  getRedis: () => ({}),
}));

import { getKnex } from '../../db/client';
import {
  calculateStreak,
  recalculateStreak,
  addDays,
  STREAK_MILESTONES,
  MILESTONE_NOTIFICATION_MAX_DELAY_MS,
} from '../../services/streak.service';

beforeEach(() => {
  mockAdd.mockClear();
  mockKnexFn.mockReset();
});

// ---------------------------------------------------------------------------
// Property 10: Streak calculation matches consecutive scheduled completions
// Validates: Requirements 4.1, 4.2
// ---------------------------------------------------------------------------

/** Naive reference implementation: no grace period, plain suffix/run count. */
function referenceStreak(completions: boolean[]): { currentStreak: number; longestStreak: number } {
  let current = 0;
  let longest = 0;
  for (const completed of completions) {
    if (completed) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return { currentStreak: current, longestStreak: longest };
}

describe('Property 10: Streak calculation matches consecutive scheduled completions', () => {
  // Feature: lifetrack-app, Property 10: Streak calculation matches consecutive scheduled completions

  test('for any sequence of scheduled-day completions, current/longest streak match the reference calculation', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 0, maxLength: 200 }), (completions) => {
        const expected = referenceStreak(completions);
        const actual = calculateStreak(completions, false);
        expect(actual).toEqual(expected);
      }),
    );
  });

  test('grace period forgives at most one missed day per rolling 7-day window without growing the streak', () => {
    // 6 completed days, 1 missed (forgiven), 3 more completed -> streak survives and keeps growing.
    const completions = [true, true, true, true, true, true, false, true, true, true];
    const { currentStreak } = calculateStreak(completions, true);
    expect(currentStreak).toBe(9); // 9 completed days total; the miss was forgiven, not counted

    // Without grace, the same sequence resets on the missed day.
    const { currentStreak: noGrace } = calculateStreak(completions, false);
    expect(noGrace).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Property 11: Milestone notifications triggered at correct streak values
// Validates: Requirements 4.5
// ---------------------------------------------------------------------------

describe('Property 11: Milestone notifications triggered at correct streak values', () => {
  // Feature: lifetrack-app, Property 11: Milestone notifications triggered at correct streak values

  test('a congratulatory notification is enqueued exactly when the streak newly reaches a milestone', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 0, maxLength: 40 }),
        async (completions) => {
          mockAdd.mockClear();

          const userId = 'user-1';
          const trackerId = 'tracker-1';
          const startDate = '2026-01-01';
          const dates = completions.map((_, i) => addDays(startDate, i));

          const trackers: FakeTrackerRow[] = [
            {
              id: trackerId,
              user_id: userId,
              is_habit: true,
              grace_enabled: false,
              frequency: 'daily',
              created_at: `${startDate}T00:00:00.000Z`,
            },
          ];
          const entriesByTracker = new Map<string, FakeEntryRow[]>([[trackerId, []]]);
          const streaks = new Map<string, FakeStreakRow>();

          mockKnexFn.mockImplementation(makeFakeKnex(trackers, entriesByTracker, streaks));

          let expectedStreak = 0;
          let previousStreak = 0;
          let expectedEnqueueCount = 0;

          for (let i = 0; i < completions.length; i++) {
            const date = dates[i]!;
            if (completions[i]) {
              entriesByTracker.get(trackerId)!.push({ local_date: date });
              expectedStreak += 1;
            } else {
              expectedStreak = 0;
            }

            await recalculateStreak(userId, trackerId, date);

            if (
              expectedStreak !== previousStreak &&
              (STREAK_MILESTONES as readonly number[]).includes(expectedStreak)
            ) {
              expectedEnqueueCount += 1;
            }
            previousStreak = expectedStreak;
          }

          expect(mockAdd).toHaveBeenCalledTimes(expectedEnqueueCount);
          for (const call of mockAdd.mock.calls) {
            const options = call[2] as { delay?: number } | undefined;
            expect(options?.delay ?? 0).toBeLessThanOrEqual(MILESTONE_NOTIFICATION_MAX_DELAY_MS);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  test('getKnex is exercised via the mocked db/client module', () => {
    // Sanity check that the mock wiring above is actually reachable.
    expect(typeof getKnex).toBe('function');
  });
});
