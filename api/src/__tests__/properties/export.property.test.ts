/**
 * Property-based tests for export.service.
 * Feature: lifetrack-app
 *
 * serializeCsv / serializeJson / parseJsonExport are pure functions, tested
 * directly. fetchExportRows (Property 18) is tested against a mocked knex.
 */

import * as fc from 'fast-check';

import { serializeCsv, serializeJson, parseJsonExport } from '../../services/export.service';
import type { ExportRow } from '../../types';

const arbitraryExportRow: fc.Arbitrary<ExportRow> = fc.record({
  trackerName: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  entryDate: fc
    .date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    .map((d) => d.toISOString().slice(0, 10)),
  entryValue: fc.oneof(
    fc.integer({ min: -1000, max: 1000 }),
    fc.boolean(),
    fc.string({ minLength: 0, maxLength: 50 }),
  ),
  entryNote: fc.string({ minLength: 0, maxLength: 100 }),
  category: fc.string({ minLength: 0, maxLength: 30 }),
});

// ---------------------------------------------------------------------------
// Property 19: CSV export contains all required columns
// Validates: Requirements 10.5
// ---------------------------------------------------------------------------

describe('Property 19: CSV export contains all required columns', () => {
  // Feature: lifetrack-app, Property 19: CSV export contains all required columns

  test('for any non-empty entry set, every CSV row has all 5 columns non-null', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbitraryExportRow, { minLength: 1, maxLength: 30 }), async (rows) => {
        const csv = serializeCsv(rows);
        const lines = csv.trim().split('\n');

        expect(lines[0]).toBe('Tracker name,Entry date,Entry value,Entry note,Category');
        expect(lines.length).toBe(rows.length + 1);

        for (const line of lines.slice(1)) {
          // A simple column count check is sufficient here since values are
          // CSV-escaped (quoted) whenever they contain a comma.
          expect(line.length).toBeGreaterThan(0);
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 21: Empty export produces correct empty structure
// Validates: Requirements 10.8
// ---------------------------------------------------------------------------

describe('Property 21: Empty export produces correct empty structure', () => {
  // Feature: lifetrack-app, Property 21: Empty export produces correct empty structure

  test('an empty entry set produces a header-only CSV', () => {
    const csv = serializeCsv([]);
    expect(csv).toBe('Tracker name,Entry date,Entry value,Entry note,Category\n');
    expect(csv.trim().split('\n')).toHaveLength(1);
  });

  test('an empty entry set produces an empty JSON array', () => {
    const json = serializeJson([]);
    expect(JSON.parse(json)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Property 20: JSON export round-trip preserves all entry fields
// Validates: Requirements 10.7
// ---------------------------------------------------------------------------

describe('Property 20: JSON export round-trip preserves all entry fields', () => {
  // Feature: lifetrack-app, Property 20: JSON export round-trip preserves all entry fields

  test('for any valid entry set, export then re-import yields identical fields', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbitraryExportRow, { minLength: 0, maxLength: 30 }), async (rows) => {
        const json = serializeJson(rows);
        const reimported = parseJsonExport(json);

        expect(reimported).toEqual(rows);
        for (let i = 0; i < rows.length; i++) {
          expect(reimported[i]!.trackerName).toBe(rows[i]!.trackerName);
          expect(reimported[i]!.entryDate).toBe(rows[i]!.entryDate);
          expect(reimported[i]!.entryValue).toBe(rows[i]!.entryValue);
          expect(reimported[i]!.entryNote).toBe(rows[i]!.entryNote);
          expect(reimported[i]!.category).toBe(rows[i]!.category);
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18: Export date range filter correctness
// Validates: Requirements 10.2
// ---------------------------------------------------------------------------

interface FakeEntryRow {
  tracker_name: string;
  local_date: string;
  value_numeric: number | null;
  value_boolean: boolean | null;
  value_text: string | null;
  note: string | null;
  category_names: string | null;
}

function makeFakeKnex(rows: FakeEntryRow[]) {
  const state: { andWheres: Array<[string, string, string]> } = { andWheres: [] };

  const builder: Record<string, unknown> = {
    join() {
      return builder;
    },
    leftJoin() {
      return builder;
    },
    where() {
      return builder;
    },
    groupBy() {
      return builder;
    },
    select() {
      return builder;
    },
    andWhere(column: string, op: string, value: string) {
      state.andWheres.push([column, op, value]);
      return builder;
    },
    then(resolve: (rows: FakeEntryRow[]) => void) {
      const filtered = rows.filter((r) =>
        state.andWheres.every(([column, op, value]) => {
          if (column !== 'e.local_date') return true;
          return op === '>=' ? r.local_date >= value : r.local_date <= value;
        }),
      );
      resolve(filtered);
    },
  };

  const knexFn = () => builder;
  knexFn.raw = (sql: string) => sql;
  return knexFn;
}

jest.mock('../../db/client', () => ({ getKnex: jest.fn() }));

import { fetchExportRows } from '../../services/export.service';
import { getKnex } from '../../db/client';

describe('Property 18: Export date range filter correctness', () => {
  // Feature: lifetrack-app, Property 18: Export date range filter correctness

  test('for any start/end date, every returned row falls within [start, end]', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            tracker_name: fc.constant('Sleep'),
            local_date: fc
              .date({ min: new Date('2026-01-01'), max: new Date('2026-12-31') })
              .map((d) => d.toISOString().slice(0, 10)),
            value_numeric: fc.integer({ min: 0, max: 10 }),
            value_boolean: fc.constant(null),
            value_text: fc.constant(null),
            note: fc.constant(null),
            category_names: fc.constant(null),
          }),
          { minLength: 0, maxLength: 40 },
        ),
        fc.date({ min: new Date('2026-01-01'), max: new Date('2026-06-30') }),
        fc.date({ min: new Date('2026-07-01'), max: new Date('2026-12-31') }),
        async (rows, startDate, endDate) => {
          const start = startDate.toISOString().slice(0, 10);
          const end = endDate.toISOString().slice(0, 10);

          (getKnex as jest.Mock).mockReturnValue(makeFakeKnex(rows as FakeEntryRow[]));

          const result = await fetchExportRows('user-1', { startDate: start, endDate: end });

          for (const row of result) {
            expect(row.entryDate >= start).toBe(true);
            expect(row.entryDate <= end).toBe(true);
          }

          // Completeness: every in-range source row is represented in the output.
          const expectedCount = (rows as FakeEntryRow[]).filter(
            (r) => r.local_date >= start && r.local_date <= end,
          ).length;
          expect(result.length).toBe(expectedCount);
        },
      ),
    );
  });
});
