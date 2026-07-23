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

export async function fetchTrackers(
  params: { includeArchived?: boolean } = {},
): Promise<Tracker[]> {
  const { data } = await apiClient.get<Tracker[]>('/trackers', {
    params: params.includeArchived ? { includeArchived: 'true' } : undefined,
  });
  return data;
}

export async function fetchTracker(trackerId: string): Promise<Tracker> {
  // No single-tracker GET endpoint exists yet; the list is small (≤ 50) so
  // filtering client-side avoids adding a new API surface just for this.
  const trackers = await fetchTrackers({ includeArchived: true });
  const tracker = trackers.find((t) => t.id === trackerId);
  if (!tracker) {
    throw new Error(`Tracker ${trackerId} not found`);
  }
  return tracker;
}

export interface CreateTrackerRequest {
  name: string;
  dataType: 'numeric' | 'boolean' | 'text';
  unit?: string;
  frequency: 'daily' | 'weekly' | { intervalDays: number };
  categories?: string[];
  validRange?: { min: number; max: number };
  isHabit?: boolean;
  graceEnabled?: boolean;
}

export interface UpdateTrackerRequest {
  name?: string;
  unit?: string;
  frequency?: 'daily' | 'weekly' | { intervalDays: number };
  validRange?: { min: number; max: number };
  isHabit?: boolean;
  graceEnabled?: boolean;
}

export async function createTracker(req: CreateTrackerRequest): Promise<Tracker> {
  const { data } = await apiClient.post<Tracker>('/trackers', req);
  return data;
}

export async function updateTracker(
  trackerId: string,
  req: UpdateTrackerRequest,
): Promise<Tracker> {
  const { data } = await apiClient.patch<Tracker>(`/trackers/${trackerId}`, req);
  return data;
}

export async function archiveTracker(trackerId: string): Promise<void> {
  await apiClient.post(`/trackers/${trackerId}/archive`);
}

export async function deleteTracker(trackerId: string): Promise<void> {
  await apiClient.delete(`/trackers/${trackerId}`);
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

export interface LogEntryRequest {
  value: number | boolean | string;
  note?: string;
  localDate: string; // YYYY-MM-DD, computed client-side from the user's local time
}

export interface EditEntryRequest {
  value?: number | boolean | string;
  note?: string;
}

export interface EntryResult {
  entry: Entry;
  noteTruncated: boolean;
}

/**
 * Requirements: 3.1, 3.7, 3.8
 *
 * On a same-day duplicate, the API returns 409 CONFLICT with
 * `existingEntryId` (surfaced via the rejected AxiosError) — callers show
 * an overwrite confirmation and, on confirm, call `editEntry` instead.
 */
export async function logEntry(trackerId: string, req: LogEntryRequest): Promise<EntryResult> {
  const response = await apiClient.post<Entry>(`/trackers/${trackerId}/entries`, req);
  return { entry: response.data, noteTruncated: response.headers['x-note-truncated'] === 'true' };
}

/** Requirements: 3.4, 3.6, 3.7, 3.8 */
export async function editEntry(
  trackerId: string,
  entryId: string,
  req: EditEntryRequest,
): Promise<EntryResult> {
  const response = await apiClient.patch<Entry>(`/trackers/${trackerId}/entries/${entryId}`, req);
  return { entry: response.data, noteTruncated: response.headers['x-note-truncated'] === 'true' };
}
