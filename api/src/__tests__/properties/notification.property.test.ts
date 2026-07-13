/**
 * Property-based tests for notification.service — reminder suppression.
 * Feature: lifetrack-app
 *
 * UNIT test. getKnex() is mocked with an in-memory fake covering the
 * reminders/users/entries/trackers tables `processReminderFire` reads.
 */

import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// In-memory fake Postgres
// ---------------------------------------------------------------------------

interface FakeReminderRow {
  id: string;
  user_id: string;
  tracker_id: string;
  time_of_day: string;
  days_of_week: number[];
  enabled: boolean;
}

interface FakeUserRow {
  id: string;
  notifications_enabled: boolean;
}

interface FakeEntryRow {
  id: string;
  tracker_id: string;
  local_date: string;
}

interface FakeTrackerRow {
  id: string;
  name: string;
}

type FakeTable = 'reminders' | 'users' | 'entries' | 'trackers';

function matches(row: Record<string, unknown>, clause: Record<string, unknown>): boolean {
  return Object.entries(clause).every(([k, v]) => row[k] === v);
}

function makeFakeKnex(
  reminders: FakeReminderRow[],
  users: FakeUserRow[],
  entries: FakeEntryRow[],
  trackers: FakeTrackerRow[],
) {
  const tables: Record<FakeTable, Record<string, unknown>[]> = {
    reminders: reminders as unknown as Record<string, unknown>[],
    users: users as unknown as Record<string, unknown>[],
    entries: entries as unknown as Record<string, unknown>[],
    trackers: trackers as unknown as Record<string, unknown>[],
  };

  return (table: FakeTable) => {
    const state: { whereClause: Record<string, unknown> } = { whereClause: {} };
    const source = tables[table];

    const builder = {
      where(clause: Record<string, unknown>) {
        state.whereClause = { ...state.whereClause, ...clause };
        return builder;
      },
      select() {
        return builder;
      },
      async first() {
        return source.find((row) => matches(row, state.whereClause));
      },
    };
    return builder;
  };
}

const mockKnexFn = jest.fn();

jest.mock('../../db/client', () => ({ getKnex: () => mockKnexFn() }));

import { processReminderFire } from '../../services/notification.service';
import type { ReminderFireJob } from '../../services/notification.service';

beforeEach(() => {
  mockKnexFn.mockReset();
});

let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

beforeAll(() => {
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  consoleLogSpy.mockRestore();
});

const TODAY = '2026-07-12';
const USER_ID = 'user-1';
const TRACKER_ID = 'tracker-1';
const REMINDER_ID = 'reminder-1';

function setup(overrides: {
  reminderEnabled?: boolean;
  notificationsEnabled?: boolean;
  hasEntryToday?: boolean;
}): void {
  const { reminderEnabled = true, notificationsEnabled = true, hasEntryToday = false } = overrides;

  const reminders: FakeReminderRow[] = [
    {
      id: REMINDER_ID,
      user_id: USER_ID,
      tracker_id: TRACKER_ID,
      time_of_day: '09:00:00',
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      enabled: reminderEnabled,
    },
  ];
  const users: FakeUserRow[] = [{ id: USER_ID, notifications_enabled: notificationsEnabled }];
  const trackers: FakeTrackerRow[] = [{ id: TRACKER_ID, name: 'Mood' }];
  const entries: FakeEntryRow[] = hasEntryToday
    ? [{ id: 'entry-1', tracker_id: TRACKER_ID, local_date: TODAY }]
    : [];

  mockKnexFn.mockReturnValue(makeFakeKnex(reminders, users, entries, trackers));
}

// ---------------------------------------------------------------------------
// Property 14: Reminder suppression when today's entry exists
// Validates: Requirements 8.3
// ---------------------------------------------------------------------------

describe("Property 14: Reminder suppression when today's entry exists", () => {
  // Feature: lifetrack-app, Property 14: Reminder suppression when today's entry exists

  test('a reminder is suppressed iff an entry already exists for that tracker today', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (hasEntryToday) => {
        setup({ hasEntryToday });

        const job: ReminderFireJob = {
          type: 'reminder-fire',
          reminderId: REMINDER_ID,
          userId: USER_ID,
          trackerId: TRACKER_ID,
        };

        const result = await processReminderFire(job, TODAY);

        expect(result.delivered).toBe(!hasEntryToday);
      }),
    );
  });

  test('a disabled reminder is never delivered, regardless of entry state', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (hasEntryToday) => {
        setup({ reminderEnabled: false, hasEntryToday });

        const job: ReminderFireJob = {
          type: 'reminder-fire',
          reminderId: REMINDER_ID,
          userId: USER_ID,
          trackerId: TRACKER_ID,
        };

        const result = await processReminderFire(job, TODAY);

        expect(result.delivered).toBe(false);
      }),
    );
  });

  test('reminders are suppressed when the user has disabled notifications globally (Req 8.4)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (hasEntryToday) => {
        setup({ notificationsEnabled: false, hasEntryToday });

        const job: ReminderFireJob = {
          type: 'reminder-fire',
          reminderId: REMINDER_ID,
          userId: USER_ID,
          trackerId: TRACKER_ID,
        };

        const result = await processReminderFire(job, TODAY);

        expect(result.delivered).toBe(false);
      }),
    );
  });
});
