import { apiClient } from '../lib/api.client';

export interface Tracker {
  id: string;
  userId: string;
  name: string;
  dataType: 'numeric' | 'boolean' | 'text';
  unit: string | null;
  frequency: 'daily' | 'weekly' | { intervalDays: number };
  validRange: { min: number; max: number } | null;
  isHabit: boolean;
  graceEnabled: boolean;
  isArchived: boolean;
  isBuiltin: boolean;
  createdAt: string;
}

export interface Entry {
  id: string;
  trackerId: string;
  userId: string;
  value: number | boolean | string;
  note: string | null;
  localDate: string;
  localTimestamp: string;
  editTimestamp: string | null;
}

export interface Streak {
  currentStreak: number;
  longestStreak: number;
}

export interface Goal {
  id: string;
  trackerId: string;
  targetValue: number;
  direction: 'ascending' | 'descending';
  deadline: string;
  status: 'active' | 'completed' | 'expired';
  progressPct: number;
}

export interface GroupedGoals {
  active: Goal[];
  completed: Goal[];
  expired: Goal[];
}

export async function fetchTrackers(): Promise<Tracker[]> {
  const { data } = await apiClient.get<Tracker[]>('/trackers');
  return data;
}

export async function fetchStreak(trackerId: string): Promise<Streak> {
  const { data } = await apiClient.get<Streak>(`/trackers/${trackerId}/streak`);
  return data;
}

export async function fetchEntries(
  trackerId: string,
  params: { start?: string; end?: string; limit?: number } = {},
): Promise<Entry[]> {
  const { data } = await apiClient.get<Entry[]>(`/trackers/${trackerId}/entries`, { params });
  return data;
}

export async function fetchGoals(): Promise<GroupedGoals> {
  const { data } = await apiClient.get<GroupedGoals>('/goals');
  return data;
}
