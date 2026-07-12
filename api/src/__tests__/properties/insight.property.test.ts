/**
 * Property-based tests for insight.service — trend classification and
 * correlation threshold. calculateTrend / pearsonCorrelation are pure
 * functions, so these properties are checked directly, no DB mocking.
 */

import * as fc from 'fast-check';

import { calculateTrend, pearsonCorrelation, classifyTrend } from '../../services/insight.service';

// ---------------------------------------------------------------------------
// Property 15: Trend insight classification matches regression slope
// Validates: Requirements 9.1, 9.5
// ---------------------------------------------------------------------------

describe('Property 15: Trend insight classification matches regression slope', () => {
  // Feature: lifetrack-app, Property 15: Trend insight classification matches regression slope

  test('a strictly increasing sequence (slope > 0.05) classifies as improving', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0.06), max: 10, noNaN: true }),
        fc.integer({ min: 14, max: 40 }),
        async (stepSize, length) => {
          const values = Array.from({ length }, (_, i) => i * stepSize);
          const result = calculateTrend(values);
          expect(result).not.toBeNull();
          expect(result!.direction).toBe('improving');
          expect(result!.slope).toBeGreaterThan(0.05);
        },
      ),
    );
  });

  test('a strictly decreasing sequence (slope < -0.05) classifies as declining', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0.06), max: 10, noNaN: true }),
        fc.integer({ min: 14, max: 40 }),
        async (stepSize, length) => {
          const values = Array.from({ length }, (_, i) => -i * stepSize);
          const result = calculateTrend(values);
          expect(result).not.toBeNull();
          expect(result!.direction).toBe('declining');
          expect(result!.slope).toBeLessThan(-0.05);
        },
      ),
    );
  });

  test('a constant sequence (slope = 0) classifies as stable', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: -1000, max: 1000, noNaN: true }),
        fc.integer({ min: 14, max: 40 }),
        async (constant, length) => {
          const values = Array.from({ length }, () => constant);
          const result = calculateTrend(values);
          expect(result).not.toBeNull();
          expect(result!.direction).toBe('stable');
          expect(result!.slope).toBe(0);
        },
      ),
    );
  });

  test('classifyTrend respects the exact ±0.05 boundary', () => {
    expect(classifyTrend(0.05)).toBe('stable');
    expect(classifyTrend(-0.05)).toBe('stable');
    expect(classifyTrend(0.0500001)).toBe('improving');
    expect(classifyTrend(-0.0500001)).toBe('declining');
  });
});

// ---------------------------------------------------------------------------
// Property 17: Insufficient data suppresses trend insight
// Validates: Requirements 9.6
// ---------------------------------------------------------------------------

describe('Property 17: Insufficient data suppresses trend insight', () => {
  // Feature: lifetrack-app, Property 17: Insufficient data suppresses trend insight

  test('for any tracker with fewer than 14 entries, no trend insight is generated', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.float({ min: -1000, max: 1000, noNaN: true }), { minLength: 0, maxLength: 13 }),
        async (values) => {
          expect(calculateTrend(values)).toBeNull();
        },
      ),
    );
  });

  test('exactly 14 entries is sufficient to produce a trend insight', () => {
    const values = Array.from({ length: 14 }, (_, i) => i);
    expect(calculateTrend(values)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Property 16: Correlation insight surfaced at or above threshold
// Validates: Requirements 9.4
// ---------------------------------------------------------------------------

describe('Property 16: Correlation insight surfaced at or above threshold', () => {
  // Feature: lifetrack-app, Property 16: Correlation insight surfaced at or above threshold

  test('perfectly correlated series (r = 1) is surfaced', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.float({ min: 0, max: 1000, noNaN: true }), { minLength: 30, maxLength: 60 }),
        fc.float({ min: Math.fround(0.01), max: 10, noNaN: true }),
        async (xs, scale) => {
          // Guard against a degenerate all-equal series (undefined correlation).
          fc.pre(new Set(xs).size > 1);
          const ys = xs.map((x) => x * scale);
          const r = pearsonCorrelation(xs, ys);
          expect(Math.abs(r)).toBeGreaterThanOrEqual(0.5);
        },
      ),
    );
  });

  test('perfectly inversely correlated series (r = -1) is surfaced', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.float({ min: 0, max: 1000, noNaN: true }), { minLength: 30, maxLength: 60 }),
        async (xs) => {
          fc.pre(new Set(xs).size > 1);
          const ys = xs.map((x) => -x);
          const r = pearsonCorrelation(xs, ys);
          expect(r).toBeCloseTo(-1, 5);
          expect(Math.abs(r)).toBeGreaterThanOrEqual(0.5);
        },
      ),
    );
  });

  test('pearsonCorrelation always returns a value within [-1, 1]', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.float({ min: -1000, max: 1000, noNaN: true }), { minLength: 30, maxLength: 60 }),
        fc.array(fc.float({ min: -1000, max: 1000, noNaN: true }), { minLength: 30, maxLength: 60 }),
        async (xs, ys) => {
          const r = pearsonCorrelation(xs, ys);
          expect(r).toBeGreaterThanOrEqual(-1.0000001);
          expect(r).toBeLessThanOrEqual(1.0000001);
        },
      ),
    );
  });
});
