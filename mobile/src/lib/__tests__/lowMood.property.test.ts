/**
 * Property-based tests for src/lib/lowMood.ts — low mood trigger.
 * Feature: lifetrack-app
 */

import * as fc from 'fast-check';

import { isLowMood, LOW_MOOD_MESSAGE, LOW_MOOD_RESOURCE_URL, wordCount } from '../lowMood';

// ---------------------------------------------------------------------------
// Property 13: Low mood entry triggers supportive content
// Validates: Requirements 7.5
// ---------------------------------------------------------------------------

describe('Property 13: Low mood entry triggers supportive content', () => {
  // Feature: lifetrack-app, Property 13: Low mood entry triggers supportive content

  test('isLowMood is true for values 1-3 and false for values 4-10', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10 }), async (value) => {
        expect(isLowMood(value)).toBe(value <= 3);
      }),
    );
  });

  test('the supportive message is <= 50 words', () => {
    expect(wordCount(LOW_MOOD_MESSAGE)).toBeLessThanOrEqual(50);
  });

  test('a well-being resource link is defined and well-formed', () => {
    expect(LOW_MOOD_RESOURCE_URL).toMatch(/^https:\/\//);
  });

  test('boundary values 3 and 4 are on the correct side of the threshold', () => {
    expect(isLowMood(3)).toBe(true);
    expect(isLowMood(4)).toBe(false);
  });
});
