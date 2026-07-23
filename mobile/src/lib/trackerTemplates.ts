import type { CreateTrackerRequest } from '../api/trackers';

export interface TrackerTemplate {
  id: string;
  label: string;
  icon: string;
  defaults: CreateTrackerRequest;
}

/**
 * Requirements: 11.2
 */
export const TRACKER_TEMPLATES: TrackerTemplate[] = [
  {
    id: 'sleep',
    label: 'Sommeil',
    icon: '🌙',
    defaults: {
      name: 'Sommeil',
      dataType: 'numeric',
      unit: 'h',
      frequency: 'daily',
      validRange: { min: 0, max: 24 },
      isHabit: false,
    },
  },
  {
    id: 'water',
    label: 'Eau',
    icon: '💧',
    defaults: {
      name: 'Eau',
      dataType: 'numeric',
      unit: 'L',
      frequency: 'daily',
      validRange: { min: 0, max: 10 },
      isHabit: false,
    },
  },
  {
    id: 'exercise',
    label: 'Exercice',
    icon: '🏃',
    defaults: {
      name: 'Exercice',
      dataType: 'boolean',
      frequency: 'daily',
      isHabit: true,
      graceEnabled: true,
    },
  },
  {
    id: 'mood',
    label: 'Humeur',
    icon: '🙂',
    defaults: {
      name: 'Humeur',
      dataType: 'numeric',
      frequency: 'daily',
      validRange: { min: 1, max: 10 },
      isHabit: false,
    },
  },
  {
    id: 'reading',
    label: 'Lecture',
    icon: '📖',
    defaults: {
      name: 'Lecture',
      dataType: 'boolean',
      frequency: 'daily',
      isHabit: true,
      graceEnabled: false,
    },
  },
];

export const MAX_ACTIVE_TRACKERS = 50;

export interface BatchSelectionResult {
  toCreate: TrackerTemplate[];
  rejected: TrackerTemplate[];
}

/**
 * Given the User's current active Tracker count and a set of selected
 * templates, determines which get created — exactly
 * min(selected.length, 50 - activeCount) — and which are rejected once the
 * limit is hit.
 *
 * Requirements: 11.7, 2.10
 */
export function resolveBatchSelection(
  activeCount: number,
  selected: TrackerTemplate[],
): BatchSelectionResult {
  const remainingCapacity = Math.max(0, MAX_ACTIVE_TRACKERS - activeCount);
  return {
    toCreate: selected.slice(0, remainingCapacity),
    rejected: selected.slice(remainingCapacity),
  };
}
