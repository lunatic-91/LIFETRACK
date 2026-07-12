/**
 * Shared fast-check arbitrary generators for property-based tests.
 * Feature: lifetrack-app
 *
 * All generators live here so they can be imported by any property test
 * under src/__tests__/properties/.
 */

import * as fc from 'fast-check';
import type { TrackerDataType, TrackerFrequency, GoalDirection } from '../../types';

// ---------------------------------------------------------------------------
// Auth generators
// ---------------------------------------------------------------------------

/**
 * Generates RFC 5321-compatible email strings:
 *   local@domain.tld  (total ≤ 254 chars)
 */
export const arbitraryValidEmail = (): fc.Arbitrary<string> =>
  fc
    .tuple(
      fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789._-'.split('')), {
        minLength: 1,
        maxLength: 30,
      }),
      fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), {
        minLength: 1,
        maxLength: 30,
      }),
      fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), {
        minLength: 2,
        maxLength: 6,
      }),
    )
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)
    .filter((email) => email.length <= 254 && !email.startsWith('.') && !email.startsWith('-'));

/**
 * Generates passwords within [minLen, maxLen] printable ASCII characters.
 */
export const arbitraryPassword = (minLen: number, maxLen: number): fc.Arbitrary<string> =>
  fc.string({ minLength: minLen, maxLength: maxLen });

// ---------------------------------------------------------------------------
// Tracker generators
// ---------------------------------------------------------------------------

export const arbitraryTrackerDataType = (): fc.Arbitrary<TrackerDataType> =>
  fc.constantFrom<TrackerDataType>('numeric', 'boolean', 'text');

export const arbitraryTrackerFrequency = (): fc.Arbitrary<TrackerFrequency> =>
  fc.oneof(
    fc.constant<TrackerFrequency>('daily'),
    fc.constant<TrackerFrequency>('weekly'),
    fc.integer({ min: 1, max: 30 }).map((intervalDays) => ({ intervalDays })),
  );

export interface TrackerConfig {
  name: string;
  dataType: TrackerDataType;
  frequency: TrackerFrequency;
  unit: string | undefined;
  validRange: { min: number; max: number } | undefined;
  isHabit: boolean;
  graceEnabled: boolean;
}

export const arbitraryTracker = (): fc.Arbitrary<TrackerConfig> =>
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }),
    dataType: arbitraryTrackerDataType(),
    frequency: arbitraryTrackerFrequency(),
    unit: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    validRange: fc.option(
      fc
        .tuple(fc.integer({ min: 0, max: 500 }), fc.integer({ min: 1, max: 1000 }))
        .filter(([a, b]) => a < b)
        .map(([min, max]) => ({ min, max })),
      { nil: undefined },
    ),
    isHabit: fc.boolean(),
    graceEnabled: fc.boolean(),
  });

// ---------------------------------------------------------------------------
// Entry generators
// ---------------------------------------------------------------------------

export interface EntryData {
  value: number | boolean | string;
  note: string | undefined;
  localDate: string; // YYYY-MM-DD
}

export const arbitraryEntry = (dataType: TrackerDataType): fc.Arbitrary<EntryData> => {
  const valueArb: fc.Arbitrary<number | boolean | string> =
    dataType === 'numeric'
      ? fc.float({ min: Math.fround(0), max: Math.fround(1000), noNaN: true })
      : dataType === 'boolean'
        ? fc.boolean()
        : fc.string({ minLength: 0, maxLength: 500 });

  return fc.record({
    value: valueArb,
    note: fc.option(fc.string({ minLength: 0, maxLength: 600 }), { nil: undefined }),
    localDate: fc
      .date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
      .map((d) => d.toISOString().slice(0, 10)),
  });
};

/**
 * Generates a sequence of habit day completions: true = completed, false = missed.
 */
export const arbitraryEntrySequence = (length: number): fc.Arbitrary<boolean[]> =>
  fc.array(fc.boolean(), { minLength: length, maxLength: length });

// ---------------------------------------------------------------------------
// Goal generators
// ---------------------------------------------------------------------------

export interface GoalConfig {
  targetValue: number;
  direction: GoalDirection;
  deadline: string; // YYYY-MM-DD
}

export const arbitraryGoal = (): fc.Arbitrary<GoalConfig> =>
  fc.record({
    targetValue: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
    direction: fc.constantFrom<GoalDirection>('ascending', 'descending'),
    deadline: fc
      .date({ min: new Date(Date.now() + 86400000), max: new Date('2030-12-31') })
      .map((d) => d.toISOString().slice(0, 10)),
  });
