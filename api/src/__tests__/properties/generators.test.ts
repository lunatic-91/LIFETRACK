/**
 * Unit tests for the fast-check generators in generators.ts.
 *
 * Each test samples from the arbitrary and asserts that every generated
 * value satisfies the expected invariants. No DB / Redis needed.
 */

import * as fc from 'fast-check';
import {
  arbitraryValidEmail,
  arbitraryPassword,
  arbitraryTrackerDataType,
  arbitraryTrackerFrequency,
  arbitraryTracker,
  arbitraryEntry,
  arbitraryEntrySequence,
  arbitraryGoal,
} from './generators';

// ---------------------------------------------------------------------------
// Email generator
// ---------------------------------------------------------------------------

describe('arbitraryValidEmail', () => {
  test('always produces a string with exactly one "@"', () => {
    fc.assert(
      fc.property(arbitraryValidEmail(), (email) => {
        expect(email).toContain('@');
        expect(email.split('@')).toHaveLength(2);
      }),
    );
  });

  test('never exceeds 254 characters (RFC 5321)', () => {
    fc.assert(
      fc.property(arbitraryValidEmail(), (email) => {
        expect(email.length).toBeLessThanOrEqual(254);
      }),
    );
  });

  test('local part never starts with "." or "-"', () => {
    fc.assert(
      fc.property(arbitraryValidEmail(), (email) => {
        const local = email.split('@')[0]!;
        expect(local).not.toMatch(/^[.-]/);
      }),
    );
  });

  test('domain part contains at least one "."', () => {
    fc.assert(
      fc.property(arbitraryValidEmail(), (email) => {
        const domain = email.split('@')[1]!;
        expect(domain).toContain('.');
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Password generator
// ---------------------------------------------------------------------------

describe('arbitraryPassword', () => {
  test('length is within [minLen, maxLen]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 64 }).chain((min) =>
          fc.integer({ min, max: 128 }).map((max) => ({ min, max })),
        ),
        ({ min, max }) => {
          fc.assert(
            fc.property(arbitraryPassword(min, max), (pwd) => {
              // fast-check counts grapheme clusters; check byte length is in range
              expect(pwd.length).toBeGreaterThanOrEqual(min);
              expect(pwd.length).toBeLessThanOrEqual(max);
            }),
          );
        },
      ),
    );
  });

  test('passwords of length 8..128 are generated correctly', () => {
    fc.assert(
      fc.property(arbitraryPassword(8, 128), (pwd) => {
        expect(pwd.length).toBeGreaterThanOrEqual(8);
        expect(pwd.length).toBeLessThanOrEqual(128);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// TrackerDataType generator
// ---------------------------------------------------------------------------

describe('arbitraryTrackerDataType', () => {
  test('always returns one of the three allowed values', () => {
    fc.assert(
      fc.property(arbitraryTrackerDataType(), (dt) => {
        expect(['numeric', 'boolean', 'text']).toContain(dt);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// TrackerFrequency generator
// ---------------------------------------------------------------------------

describe('arbitraryTrackerFrequency', () => {
  test('always returns "daily", "weekly", or an intervalDays object', () => {
    fc.assert(
      fc.property(arbitraryTrackerFrequency(), (freq) => {
        if (typeof freq === 'string') {
          expect(['daily', 'weekly']).toContain(freq);
        } else {
          expect(typeof freq.intervalDays).toBe('number');
          expect(freq.intervalDays).toBeGreaterThanOrEqual(1);
          expect(freq.intervalDays).toBeLessThanOrEqual(30);
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// TrackerConfig generator
// ---------------------------------------------------------------------------

describe('arbitraryTracker', () => {
  test('name is 1–100 chars', () => {
    fc.assert(
      fc.property(arbitraryTracker(), (t) => {
        expect(t.name.length).toBeGreaterThanOrEqual(1);
        expect(t.name.length).toBeLessThanOrEqual(100);
      }),
    );
  });

  test('isHabit and graceEnabled are booleans', () => {
    fc.assert(
      fc.property(arbitraryTracker(), (t) => {
        expect(typeof t.isHabit).toBe('boolean');
        expect(typeof t.graceEnabled).toBe('boolean');
      }),
    );
  });

  test('validRange, when present, satisfies min < max', () => {
    fc.assert(
      fc.property(arbitraryTracker(), (t) => {
        if (t.validRange !== undefined) {
          expect(t.validRange.min).toBeLessThan(t.validRange.max);
        }
      }),
    );
  });

  test('dataType is one of the three allowed values', () => {
    fc.assert(
      fc.property(arbitraryTracker(), (t) => {
        expect(['numeric', 'boolean', 'text']).toContain(t.dataType);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Entry generator
// ---------------------------------------------------------------------------

describe('arbitraryEntry', () => {
  test('numeric entry value is a number', () => {
    fc.assert(
      fc.property(arbitraryEntry('numeric'), (e) => {
        expect(typeof e.value).toBe('number');
      }),
    );
  });

  test('boolean entry value is a boolean', () => {
    fc.assert(
      fc.property(arbitraryEntry('boolean'), (e) => {
        expect(typeof e.value).toBe('boolean');
      }),
    );
  });

  test('text entry value is a string', () => {
    fc.assert(
      fc.property(arbitraryEntry('text'), (e) => {
        expect(typeof e.value).toBe('string');
      }),
    );
  });

  test('localDate is in YYYY-MM-DD format', () => {
    fc.assert(
      fc.property(arbitraryEntry('numeric'), (e) => {
        expect(e.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }),
    );
  });

  test('note, when present, is a string', () => {
    fc.assert(
      fc.property(arbitraryEntry('text'), (e) => {
        if (e.note !== undefined) {
          expect(typeof e.note).toBe('string');
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Entry sequence generator
// ---------------------------------------------------------------------------

describe('arbitraryEntrySequence', () => {
  test('length is exactly as requested', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), (len) => {
        fc.assert(
          fc.property(arbitraryEntrySequence(len), (seq) => {
            expect(seq).toHaveLength(len);
          }),
        );
      }),
    );
  });

  test('each element is a boolean', () => {
    fc.assert(
      fc.property(arbitraryEntrySequence(7), (seq) => {
        seq.forEach((v) => expect(typeof v).toBe('boolean'));
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Goal generator
// ---------------------------------------------------------------------------

describe('arbitraryGoal', () => {
  test('targetValue is positive', () => {
    fc.assert(
      fc.property(arbitraryGoal(), (g) => {
        expect(g.targetValue).toBeGreaterThan(0);
      }),
    );
  });

  test('direction is "ascending" or "descending"', () => {
    fc.assert(
      fc.property(arbitraryGoal(), (g) => {
        expect(['ascending', 'descending']).toContain(g.direction);
      }),
    );
  });

  test('deadline is a future date in YYYY-MM-DD format', () => {
    const today = new Date().toISOString().slice(0, 10);
    fc.assert(
      fc.property(arbitraryGoal(), (g) => {
        expect(g.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(g.deadline > today).toBe(true);
      }),
    );
  });
});
