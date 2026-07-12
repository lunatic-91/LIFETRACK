import * as fc from 'fast-check';

// Configure fast-check global settings for all property-based tests
// Feature: lifetrack-app — 100 runs per property as specified in the design document
fc.configureGlobal({
  numRuns: 100,
  verbose: true,
});
