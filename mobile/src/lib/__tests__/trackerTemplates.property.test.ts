/**
 * Property-based tests for src/lib/trackerTemplates.ts — onboarding batch
 * selection logic.
 * Feature: lifetrack-app
 */

import * as fc from 'fast-check';

import { TRACKER_TEMPLATES, MAX_ACTIVE_TRACKERS, resolveBatchSelection } from '../trackerTemplates';

const arbitraryTemplateSubset = fc
  .subarray(TRACKER_TEMPLATES, { minLength: 0, maxLength: TRACKER_TEMPLATES.length })
  .chain((subset) =>
    subset.length === 0
      ? fc.constant([])
      : fc.array(fc.constantFrom(...subset), { minLength: 0, maxLength: 10 }),
  );

// ---------------------------------------------------------------------------
// Property 22: Onboarding template creates tracker with correct defaults
// Validates: Requirements 11.3
// ---------------------------------------------------------------------------

describe('Property 22: Onboarding template creates tracker with correct defaults', () => {
  // Feature: lifetrack-app, Property 22: Onboarding template creates tracker with correct defaults

  test('every template exposes a complete, valid CreateTrackerRequest', () => {
    for (const template of TRACKER_TEMPLATES) {
      expect(template.defaults.name.length).toBeGreaterThan(0);
      expect(['numeric', 'boolean', 'text']).toContain(template.defaults.dataType);
      expect(['daily', 'weekly']).toContain(template.defaults.frequency);
      if (template.defaults.validRange) {
        expect(template.defaults.validRange.min).toBeLessThan(template.defaults.validRange.max);
      }
    }
  });

  test('there are at least 5 pre-built templates', () => {
    expect(TRACKER_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Property 24: Active tracker limit enforced during onboarding batch selection
// Validates: Requirements 11.7, 2.10
// ---------------------------------------------------------------------------

describe('Property 24: Active tracker limit enforced during onboarding batch selection', () => {
  // Feature: lifetrack-app, Property 24: Active tracker limit enforced during onboarding batch selection

  test('for any N active trackers and K selected templates, exactly min(K, 50-N) are created', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 50 }),
        arbitraryTemplateSubset,
        async (activeCount, selected) => {
          const { toCreate, rejected } = resolveBatchSelection(activeCount, selected);
          const remainingCapacity = Math.max(0, MAX_ACTIVE_TRACKERS - activeCount);

          expect(toCreate.length).toBe(Math.min(selected.length, remainingCapacity));
          expect(toCreate.length + rejected.length).toBe(selected.length);
          expect(activeCount + toCreate.length).toBeLessThanOrEqual(MAX_ACTIVE_TRACKERS);
        },
      ),
    );
  });

  test('at exactly 50 active trackers, no new template can be created', () => {
    const { toCreate, rejected } = resolveBatchSelection(50, [TRACKER_TEMPLATES[0]!]);
    expect(toCreate).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Property 23: Re-selecting existing template creates a new tracker
// Validates: Requirements 11.6
// ---------------------------------------------------------------------------

describe('Property 23: Re-selecting existing template creates a new tracker', () => {
  // Feature: lifetrack-app, Property 23: Re-selecting existing template creates a new tracker

  test('selecting the same template twice (two onboarding sessions) both count toward creation, not deduplicated', () => {
    const template = TRACKER_TEMPLATES[0]!;
    // Simulates: first session selects it (activeCount 0 -> 1), second
    // session (re-run from settings) selects it again with the updated count.
    const firstRun = resolveBatchSelection(0, [template]);
    expect(firstRun.toCreate).toHaveLength(1);

    const secondRun = resolveBatchSelection(1, [template]);
    expect(secondRun.toCreate).toHaveLength(1);

    // Nothing in resolveBatchSelection deduplicates by template id — each
    // call independently produces a tracker to create, matching the
    // requirement that re-running onboarding creates a distinct new tracker
    // rather than mutating the existing one.
    expect(firstRun.toCreate[0]!.id).toBe(secondRun.toCreate[0]!.id);
  });
});
