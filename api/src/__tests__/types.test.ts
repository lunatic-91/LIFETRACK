/**
 * Unit tests for shared TypeScript types (runtime shape checks).
 * These tests verify that the type-level contracts hold at runtime by
 * constructing objects that satisfy each interface and asserting their shape.
 *
 * No database or Redis connection required.
 */

import type {
  SessionTokens,
  ValidationError,
  AuthError,
  ConflictError,
  RateLimitError,
  NotFoundError,
  InternalError,
  TrackerDataType,
  TrackerFrequency,
  GoalDirection,
  GoalStatus,
  TrendDirection,
  ExportFormat,
} from '../types';

// ---------------------------------------------------------------------------
// Literal union helpers
// ---------------------------------------------------------------------------

describe('TrackerDataType literals', () => {
  const valid: TrackerDataType[] = ['numeric', 'boolean', 'text'];

  test.each(valid)('"%s" is a valid TrackerDataType', (v) => {
    expect(v).toMatch(/^(numeric|boolean|text)$/);
  });
});

describe('TrackerFrequency literals and object', () => {
  test('"daily" is accepted', () => {
    const f: TrackerFrequency = 'daily';
    expect(f).toBe('daily');
  });

  test('"weekly" is accepted', () => {
    const f: TrackerFrequency = 'weekly';
    expect(f).toBe('weekly');
  });

  test('intervalDays object is accepted', () => {
    const f: TrackerFrequency = { intervalDays: 3 };
    expect(f).toEqual({ intervalDays: 3 });
  });
});

describe('GoalDirection literals', () => {
  test.each<GoalDirection>(['ascending', 'descending'])('"%s" is valid', (v) => {
    expect(v).toMatch(/^(ascending|descending)$/);
  });
});

describe('GoalStatus literals', () => {
  test.each<GoalStatus>(['active', 'completed', 'expired'])('"%s" is valid', (v) => {
    expect(v).toMatch(/^(active|completed|expired)$/);
  });
});

describe('TrendDirection literals', () => {
  test.each<TrendDirection>(['improving', 'stable', 'declining'])('"%s" is valid', (v) => {
    expect(v).toMatch(/^(improving|stable|declining)$/);
  });
});

describe('ExportFormat literals', () => {
  test.each<ExportFormat>(['csv', 'json'])('"%s" is valid', (v) => {
    expect(v).toMatch(/^(csv|json)$/);
  });
});

// ---------------------------------------------------------------------------
// Error envelope shapes
// ---------------------------------------------------------------------------

describe('SessionTokens shape', () => {
  test('has accessToken and refreshToken strings', () => {
    const tokens: SessionTokens = {
      accessToken: 'jwt.access.token',
      refreshToken: 'opaque-refresh-token',
    };
    expect(typeof tokens.accessToken).toBe('string');
    expect(typeof tokens.refreshToken).toBe('string');
  });
});

describe('ValidationError shape', () => {
  test('has correct discriminant and fields map', () => {
    const err: ValidationError = {
      error: 'VALIDATION_ERROR',
      message: 'Invalid input',
      fields: { email: 'Invalid format', password: 'Too short' },
    };
    expect(err.error).toBe('VALIDATION_ERROR');
    expect(typeof err.message).toBe('string');
    expect(typeof err.fields).toBe('object');
    expect(err.fields['email']).toBe('Invalid format');
  });
});

describe('AuthError shape', () => {
  test('has correct discriminant and generic message', () => {
    const err: AuthError = {
      error: 'AUTH_ERROR',
      message: 'Invalid credentials',
    };
    expect(err.error).toBe('AUTH_ERROR');
    expect(typeof err.message).toBe('string');
  });
});

describe('ConflictError shape', () => {
  test('has correct discriminant, with optional existingEntryId', () => {
    const errWithId: ConflictError = {
      error: 'CONFLICT',
      message: 'Entry already exists for this day',
      existingEntryId: 'entry-uuid-123',
    };
    expect(errWithId.error).toBe('CONFLICT');
    expect(errWithId.existingEntryId).toBe('entry-uuid-123');

    const errWithout: ConflictError = {
      error: 'CONFLICT',
      message: 'Conflict',
    };
    expect(errWithout.existingEntryId).toBeUndefined();
  });
});

describe('RateLimitError shape', () => {
  test('has retryAfter as a string', () => {
    const err: RateLimitError = {
      error: 'RATE_LIMIT',
      message: 'Too many requests',
      retryAfter: '2024-01-01T00:00:00.000Z',
    };
    expect(err.error).toBe('RATE_LIMIT');
    expect(typeof err.retryAfter).toBe('string');
  });
});

describe('NotFoundError shape', () => {
  test('has correct discriminant', () => {
    const err: NotFoundError = {
      error: 'NOT_FOUND',
      message: 'Tracker not found',
    };
    expect(err.error).toBe('NOT_FOUND');
  });
});

describe('InternalError shape', () => {
  test('has a correlationId string', () => {
    const err: InternalError = {
      error: 'INTERNAL_ERROR',
      message: 'Unexpected failure',
      correlationId: 'corr-abc-123',
    };
    expect(err.error).toBe('INTERNAL_ERROR');
    expect(typeof err.correlationId).toBe('string');
  });
});
