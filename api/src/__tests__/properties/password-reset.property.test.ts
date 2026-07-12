/**
 * Property-based tests for password reset flow.
 * Feature: lifetrack-app
 *
 * Property 4: Password reset token single-use and expiry enforcement
 * Property 5: Password reset rate limiting
 */

import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$fixedhashedpassword'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../db/seeds/01_builtin_trackers', () => ({
  seedBuiltinTrackers: jest.fn().mockResolvedValue(undefined),
}));

const mockRedisIncr = jest.fn();
const mockRedisExpire = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisDel = jest.fn();

// mockKnexFn is called as a tagged-template / function: knex('table')
const mockKnexFn = jest.fn();

jest.mock('../../db/client', () => ({
  getKnex: () => mockKnexFn,
  getRedis: () => ({
    incr: mockRedisIncr,
    expire: mockRedisExpire,
    set: mockRedisSet,
    get: mockRedisGet,
    del: mockRedisDel,
  }),
  _setKnex: jest.fn(),
  _setRedis: jest.fn(),
  _resetClients: jest.fn(),
}));

import { confirmPasswordReset, requestPasswordReset } from '../../services/auth.service';
import type { AuthError, RateLimitError } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a knex query chain mock that resolves .where().select().first() → value */
function knexChainReturning(value: unknown) {
  const first = jest.fn().mockResolvedValue(value);
  const select = jest.fn().mockReturnValue({ first });
  const where = jest.fn().mockReturnValue({ select, first, update: jest.fn().mockResolvedValue(1) });
  const insert = jest.fn().mockResolvedValue([{ id: 'user-uuid' }]);
  return { where, select, first, insert };
}

beforeEach(() => {
  process.env['JWT_SECRET'] = 'test-secret';
  mockRedisExpire.mockResolvedValue(1);
  mockRedisSet.mockResolvedValue('OK');
  mockRedisGet.mockResolvedValue(null);
  mockRedisDel.mockResolvedValue(1);
});

afterEach(() => {
  jest.clearAllMocks();
  delete process.env['JWT_SECRET'];
});

// ---------------------------------------------------------------------------
// Property 4: Password reset token single-use and expiry enforcement
// Feature: lifetrack-app, Property 4: Password reset token single-use and expiry enforcement
// Validates: Requirements 1.8
// ---------------------------------------------------------------------------

describe('Property 4: Password reset token single-use and expiry enforcement', () => {
  test('already-used token (used_at set) is rejected and returns AUTH_ERROR', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 128 }), // new password
        async (newPassword) => {
          const usedToken = {
            token: 'some-token',
            user_id: 'user-uuid',
            used_at: new Date().toISOString(), // already used
            expires_at: new Date(Date.now() + 86400000).toISOString(), // still valid expiry
          };

          const chain = knexChainReturning(usedToken);
          mockKnexFn.mockReturnValue(chain);

          const result = await confirmPasswordReset('some-token', newPassword);

          expect(result).toHaveProperty('error', 'AUTH_ERROR');
          // password update must NOT have been called
          expect(chain.where().update).not.toHaveBeenCalledWith(
            expect.objectContaining({ password_hash: expect.anything() }),
          );
        },
      ),
    );
  });

  test('expired token (expires_at in the past) is rejected and returns AUTH_ERROR', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 128 }),
        async (newPassword) => {
          const expiredToken = {
            token: 'some-token',
            user_id: 'user-uuid',
            used_at: null,
            expires_at: new Date(Date.now() - 1000).toISOString(), // already expired
          };

          const chain = knexChainReturning(expiredToken);
          mockKnexFn.mockReturnValue(chain);

          const result = await confirmPasswordReset('some-token', newPassword);

          expect(result).toHaveProperty('error', 'AUTH_ERROR');
        },
      ),
    );
  });

  test('non-existent token returns AUTH_ERROR', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 128 }),
        async (newPassword) => {
          const chain = knexChainReturning(undefined); // not found
          mockKnexFn.mockReturnValue(chain);

          const result = await confirmPasswordReset('unknown-token', newPassword);

          expect(result).toHaveProperty('error', 'AUTH_ERROR');
        },
      ),
    );
  });

  test('error message for invalid/expired token does not reveal token state', async () => {
    // used token
    const usedToken = { token: 't', user_id: 'u', used_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() };
    // expired token
    const expiredToken = { token: 't', user_id: 'u', used_at: null, expires_at: new Date(Date.now() - 1000).toISOString() };

    const chain1 = knexChainReturning(usedToken);
    mockKnexFn.mockReturnValue(chain1);
    const r1 = await confirmPasswordReset('t', 'password123') as AuthError;

    const chain2 = knexChainReturning(expiredToken);
    mockKnexFn.mockReturnValue(chain2);
    const r2 = await confirmPasswordReset('t', 'password123') as AuthError;

    // Both cases must return the same message (no state leakage)
    expect(r1.message).toBe(r2.message);
  });
});

// ---------------------------------------------------------------------------
// Property 5: Password reset rate limiting
// Feature: lifetrack-app, Property 5: Password reset rate limiting
// Validates: Requirements 1.9
// ---------------------------------------------------------------------------

describe('Property 5: Password reset rate limiting', () => {
  test('4th+ request within the window is rejected with RATE_LIMIT error', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate counts above 3 (4, 5, 6 … 20)
        fc.integer({ min: 4, max: 20 }),
        fc.string({ minLength: 1, maxLength: 50 }).map((s) => `${s}@example.com`),
        async (count, email) => {
          mockRedisIncr.mockResolvedValue(count);

          const result = await requestPasswordReset(email);

          expect(result).toBeDefined();
          expect((result as RateLimitError).error).toBe('RATE_LIMIT');
          expect(typeof (result as RateLimitError).retryAfter).toBe('string');
          // retryAfter must be a future ISO timestamp
          expect(new Date((result as RateLimitError).retryAfter).getTime()).toBeGreaterThan(Date.now() - 1000);
        },
      ),
    );
  });

  test('first 3 requests within the window succeed (no RATE_LIMIT returned)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        async (count) => {
          mockRedisIncr.mockResolvedValue(count);

          // User not found → silent void (Req 1.7)
          const chain = knexChainReturning(undefined);
          mockKnexFn.mockReturnValue(chain);

          const result = await requestPasswordReset('user@example.com');

          // Must NOT return RATE_LIMIT
          if (result !== undefined) {
            expect((result as RateLimitError).error).not.toBe('RATE_LIMIT');
          }
        },
      ),
    );
  });

  test('retryAfter is always a future ISO 8601 timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 4, max: 100 }),
        async (count) => {
          mockRedisIncr.mockResolvedValue(count);

          const before = Date.now();
          const result = await requestPasswordReset('test@example.com') as RateLimitError;

          expect(result.error).toBe('RATE_LIMIT');
          const retryMs = new Date(result.retryAfter).getTime();
          expect(retryMs).toBeGreaterThanOrEqual(before);
          // retryAfter should be roughly 1 hour from now
          expect(retryMs).toBeLessThanOrEqual(Date.now() + 3600000 + 5000);
        },
      ),
    );
  });
});
