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

export interface InternalError {
  error: 'INTERNAL_ERROR';
  message: string;
  correlationId: string;
}
