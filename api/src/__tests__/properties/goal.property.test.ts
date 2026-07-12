/**
 * Property-based test for goal.service — progress formula correctness.
 * Feature: lifetrack-app
 *
 * computeProgressPct is a pure function, so this property is checked
 * directly against it — no DB mocking needed.
 */

import * as fc from 'fast-check';

import { computeProgressPct } from '../../services/goal.service';
import { arbitraryGoal } from './generators';

// ---------------------------------------------------------------------------
// Property 8: Goal progress formula correctness
// Validates: Requirements 5.3, 5.9
// ---------------------------------------------------------------------------

describe('Property 8: Goal progress formula correctness', () => {
  // Feature: lifetrack-app, Property 8: Goal progress formula correctness

  test('ascending goals: progress = clamp((sum / target) * 100, 0, 100)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryGoal().filter((g) => g.direction === 'ascending'),
        fc.array(fc.float({ min: -1000, max: 1000, noNaN: true }), { minLength: 0, maxLength: 20 }),
        async (goal, entryValues) => {
          const sum = entryValues.reduce((acc, v) => acc + v, 0);
          const result = computeProgressPct('ascending', goal.targetValue, sum, 0);
          const expected = Math.min(100, Math.max(0, (sum / goal.targetValue) * 100));

          expect(result).toBeCloseTo(expected, 5);
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(100);
        },
      ),
    );
  });

  test('descending goals: progress = clamp((1 - latest/target) * 100, 0, 100)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryGoal().filter((g) => g.direction === 'descending'),
        fc.float({ min: -1000, max: 1000, noNaN: true }),
        async (goal, latestValue) => {
          const result = computeProgressPct('descending', goal.targetValue, 0, latestValue);
          const expected = Math.min(
            100,
            Math.max(0, (1 - latestValue / goal.targetValue) * 100),
          );

          expect(result).toBeCloseTo(expected, 5);
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(100);
        },
      ),
    );
  });

  test('result is always within [0, 100] regardless of direction or inputs', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryGoal(),
        fc.float({ min: -100000, max: 100000, noNaN: true }),
        fc.float({ min: -100000, max: 100000, noNaN: true }),
        async (goal, sum, latest) => {
          const result = computeProgressPct(goal.direction, goal.targetValue, sum, latest);
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(100);
        },
      ),
    );
  });
});
