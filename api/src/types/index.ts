// Shared TypeScript types for the LifeTrack API
// Full type definitions are added in subsequent tasks

export type TrackerFrequency =
  | 'daily'
  | 'weekly'
  | { intervalDays: number };

export type TrackerDataType = 'numeric' | 'boolean' | 'text';

export type GoalDirection = 'ascending' | 'descending';

export type GoalStatus = 'active' | 'completed' | 'expired';

export type TrendDirection = 'improving' | 'stable' | 'declining';

export type ExportFormat = 'csv' | 'json';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ValidationError {
  error: 'VALIDATION_ERROR';
  message: string;
  fields: Record<string, string>;
}

export interface AuthError {
  error: 'AUTH_ERROR';
  message: string;
}

export interface ConflictError {
  error: 'CONFLICT';
  message: string;
  existingEntryId?: string;
}

export interface RateLimitError {
  error: 'RATE_LIMIT';
  message: string;
  retryAfter: string;
}

export interface NotFoundError {
  error: 'NOT_FOUND';
  message: string;
}

export interface LimitError {
  error: 'LIMIT_ERROR';
  message: string;
}

export interface ValidRange {
  min: number;
  max: number;
}

export interface Tracker {
  id: string;
  userId: string;
  name: string;
  dataType: TrackerDataType;
  unit: string | null;
  frequency: TrackerFrequency;
  validRange: ValidRange | null;
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
  localDate: string; // YYYY-MM-DD
  localTimestamp: string;
  editTimestamp: string | null;
}

export interface InternalError {
  error: 'INTERNAL_ERROR';
  message: string;
  correlationId: string;
}
