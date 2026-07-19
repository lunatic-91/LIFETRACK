/**
 * Property-based tests for src/lib/trends.ts — weekly average calculation.
 * Feature: lifetrack-app
 */

import * as fc from 'fast-check';

import { computeWeeklyTrend } from '../trends';

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Property 12: Weekly trend chart average calculation
// Validates: Requirements 7.4, 7.6
// ---------------------------------------------------------------------------

describe('Property 12: Weekly trend chart average calculation', () => {
  // Feature: lifetrack-app, Property 12: Weekly trend chart average calculation

  test('each day in the window equals the arithmetic mean of that day\'s entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 0, maxLength: 5 }), // day 0
        fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 0, maxLength: 5 }), // day 3
        fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 0, maxLength: 5 }), // day 6 (today)
        async (day0Values, day3Values, day6Values) => {
          const today = '2026-07-19';
          const entries = [
            ...day0Values.map((v) => ({ localDate: addDays(today, -6), value: v })),
            ...day3Values.map((v) => ({ localDate: addDays(today, -3), value: v })),
            ...day6Values.map((v) => ({ localDate: today, value: v })),
          ];

          const points = computeWeeklyTrend(entries, today);
          expect(points).toHaveLength(7);

          const expectedAverage = (values: number[]): number | null =>
            values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

          expect(points[0]!.average).toBe(expectedAverage(day0Values));
          expect(points[3]!.average).toBe(expectedAverage(day3Values));
          expect(points[6]!.average).toBe(expectedAverage(day6Values));
        },
      ),
    );
  });

  test('days with no entries use null as the placeholder', () => {
    const points = computeWeeklyTrend([], '2026-07-19');
    expect(points).toHaveLength(7);
    for (const point of points) {
      expect(point.average).toBeNull();
    }
  });

  test('the window always spans exactly 7 consecutive days ending on today', () => {
    const points = computeWeeklyTrend([], '2026-07-19');
    expect(points[0]!.date).toBe('2026-07-13');
    expect(points[6]!.date).toBe('2026-07-19');
  });
});
