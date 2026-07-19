import { useQuery } from '@tanstack/react-query';

import { fetchTrackers, fetchStreak, fetchEntries, fetchGoals } from '../api/trackers';
import type { Tracker } from '../api/trackers';

export interface TrackerCardData {
  tracker: Tracker;
  currentStreak: number;
  latestEntryValue: number | boolean | string | null;
  hasPendingEntryToday: boolean;
  goalProgressPct: number | null;
}

function todayLocalDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadTrackerCard(tracker: Tracker): Promise<TrackerCardData> {
  const [streak, entries, goals] = await Promise.all([
    tracker.isHabit ? fetchStreak(tracker.id) : Promise.resolve({ currentStreak: 0, longestStreak: 0 }),
    fetchEntries(tracker.id, { limit: 1 }),
    fetchGoals(),
  ]);

  const latestEntry = entries[0] ?? null;
  const today = todayLocalDate();

  const linkedGoal = goals.active.find((g) => g.trackerId === tracker.id);

  return {
    tracker,
    currentStreak: streak.currentStreak,
    latestEntryValue: latestEntry?.value ?? null,
    hasPendingEntryToday: latestEntry?.localDate !== today,
    goalProgressPct: linkedGoal?.progressPct ?? null,
  };
}

/**
 * Requirements: 6.1, 6.2, 6.6
 */
export function useDashboardData() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async (): Promise<TrackerCardData[]> => {
      const trackers = await fetchTrackers();
      return Promise.all(trackers.map(loadTrackerCard));
    },
  });
}
