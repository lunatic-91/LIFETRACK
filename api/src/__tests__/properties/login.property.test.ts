/**
 * Property-based tests for auth.service — login invalid credentials.
 * Feature: lifetrack-app
 *
 * These are UNIT tests. getKnex() and getRedis() are mocked via jest.mock().
 * bcrypt is mocked to avoid slow hashing in test runs.
 * seedBuiltinTrackers is mocked to be a no-op.
 *
 * Property 3: Invalid credentials produce a generic error
 * Validates: Requirements 1.5
 */

// Feature: lifetrack-app, Property 3: Invalid credentials produce a generic error

import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mock bcrypt before importing auth.service
// ---------------------------------------------------------------------------
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$fixedhashedpassword'),
  compare: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock seedBuiltinTrackers to be a no-op
// ---------------------------------------------------------------------------
jest.mock('../../db/seeds/01_builtin_trackers', () => ({
  seedBuiltinTrackers: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock db/client — provides controllable getKnex() / getRedis()
// ---------------------------------------------------------------------------
const mockKnexFn = jest.fn();
const mockRedisSet = jest.fn();

jest.mock('../../db/client', () => ({
  getKnex: () => mockKnexFn,
  getRedis: () => ({ set: mockRedisSet }),
  _setKnex: jest.fn(),
  _setRedis: jest.fn(),
  _resetClients: jest.fn(),
}));

import bcrypt from 'bcrypt';
import { loginUser } from '../../services/auth.service';
import type { AuthError } from '../../types';
import { arbitraryValidEmail, arbitraryPassword } from './generators';

// ---------------------------------------------------------------------------
// Helpers — configure the mock knex chain for each scenario
// ---------------------------------------------------------------------------

/**
 * Configures mockKnexFn so that knex('users').where(...).select(...).first()
 * returns undefined — simulating "user not found".
 */
function setupMockKnexUserNotFound(): void {
  const firstFn = jest.fn().mockResolvedValue(undefined);
  const selectFn = jest.fn().mockReturnValue({ first: firstFn });
  const whereFn = jest.fn().mockReturnValue({ select: selectFn });
  mockKnexFn.mockReturnValue({ where: whereFn });
}

/**
 * Configures mockKnexFn so that knex('users').where(...).select(...).first()
 * returns a user row with a fake hash — simulating "user found, password wrong".
 */
function setupMockKnexUserFound(): void {
  const fakeUser = {
    id: 'test-user-uuid',
    email: 'test@example.com',
    password_hash: '$2b$12$fakehashforthisuser',
  };
  const firstFn = jest.fn().mockResolvedValue(fakeUser);
  const selectFn = jest.fn().mockReturnValue({ first: firstFn });
  const whereFn = jest.fn().mockReturnValue({ select: selectFn });
  mockKnexFn.mockReturnValue({ where: whereFn });
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env['JWT_SECRET'] = 'test-jwt-secret-for-property-tests';
  mockRedisSet.mockResolvedValue('OK');
});

afterEach(() => {
  jest.clearAllMocks();
  delete process.env['JWT_SECRET'];
});

// ---------------------------------------------------------------------------
// Property 3: Invalid credentials produce a generic error
// Validates: Requirements 1.5
// ---------------------------------------------------------------------------

describe('Property 3: Invalid credentials produce a generic error', () => {
  // Feature: lifetrack-app, Property 3: Invalid credentials produce a generic error

  test('for any email/password where user is not found, returns AUTH_ERROR without revealing which field failed', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryValidEmail(),
        arbitraryPassword(8, 128),
        async (email, password) => {
          // User not found — knex returns undefined
          setupMockKnexUserNotFound();
          // bcrypt.compare is not called in this path (dummy compare runs internally)
          (bcrypt.compare as jest.Mock).mockResolvedValue(false);

          const result = await loginUser({ email, password });

          // Must return AUTH_ERROR
          expect(result).toHaveProperty('error', 'AUTH_ERROR');

          const err = result as AuthError;

          // Message must not reveal which field was wrong
          const message = err.message.toLowerCase();
          expect(message).not.toContain('email');
          expect(message).not.toContain('password');
          expect(message).not.toContain('not found');
          expect(message).not.toContain('incorrect');
        },
      ),
    );
  });

  test('for any email/password where password does not match, returns AUTH_ERROR without revealing which field failed', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryValidEmail(),
        arbitraryPassword(8, 128),
        async (email, password) => {
          // User found in DB but bcrypt.compare returns false (wrong password)
          setupMockKnexUserFound();
          (bcrypt.compare as jest.Mock).mockResolvedValue(false);

          const result = await loginUser({ email, password });

          // Must return AUTH_ERROR
          expect(result).toHaveProperty('error', 'AUTH_ERROR');

          const err = result as AuthError;

          // Message must not reveal which field was wrong
          const message = err.message.toLowerCase();
          expect(message).not.toContain('email');
          expect(message).not.toContain('password');
          expect(message).not.toContain('not found');
          expect(message).not.toContain('incorrect');
        },
      ),
    );
  });

  test('error message is identical regardless of whether email or password was wrong (no information leakage)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryValidEmail(),
        arbitraryPassword(8, 128),
        async (email, password) => {
          // Case A: user not found
          setupMockKnexUserNotFound();
          (bcrypt.compare as jest.Mock).mockResolvedValue(false);
          const resultNotFound = await loginUser({ email, password });

          // Case B: user found, wrong password
          setupMockKnexUserFound();
          (bcrypt.compare as jest.Mock).mockResolvedValue(false);
          const resultWrongPassword = await loginUser({ email, password });

          // Both must be AUTH_ERROR
          expect(resultNotFound).toHaveProperty('error', 'AUTH_ERROR');
          expect(resultWrongPassword).toHaveProperty('error', 'AUTH_ERROR');

          // The message must be identical in both cases (no information leakage)
          expect((resultNotFound as AuthError).message).toBe(
            (resultWrongPassword as AuthError).message,
          );
        },
      ),
    );
  });
});
