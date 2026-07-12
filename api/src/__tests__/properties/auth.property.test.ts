/**
 * Property-based tests for auth.service — registration validation.
 * Feature: lifetrack-app
 *
 * These are UNIT tests. getKnex() and getRedis() are mocked via jest.mock().
 * bcrypt is mocked to avoid slow hashing in test runs.
 * seedBuiltinTrackers is mocked to be a no-op.
 */

import * as fc from 'fast-check';
import type { Knex } from 'knex';

// ---------------------------------------------------------------------------
// Mock bcrypt before importing auth.service
// ---------------------------------------------------------------------------
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$fixedhashedpassword'),
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

import { registerUser } from '../../services/auth.service';
import type { SessionTokens, ValidationError } from '../../types';
import { arbitraryValidEmail, arbitraryPassword } from './generators';

// ---------------------------------------------------------------------------
// Helpers — configure the mock knex chain for each test run
// ---------------------------------------------------------------------------

/**
 * Configures mockKnexFn to simulate:
 *   knex('users').insert(...).returning('id') → [{ id: 'test-user-uuid' }]
 */
function setupMockKnexInsert(): void {
  const returningFn = jest.fn().mockResolvedValue([{ id: 'test-user-uuid' }]);
  const insertFn = jest.fn().mockReturnValue({ returning: returningFn });
  mockKnexFn.mockReturnValue({ insert: insertFn });
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Set a JWT_SECRET so registerUser can sign tokens
  process.env['JWT_SECRET'] = 'test-jwt-secret-for-property-tests';
  mockRedisSet.mockResolvedValue('OK');
});

afterEach(() => {
  jest.clearAllMocks();
  delete process.env['JWT_SECRET'];
});

// ---------------------------------------------------------------------------
// Property 1: Valid registration creates an account
// Validates: Requirements 1.1
// ---------------------------------------------------------------------------

describe('Property 1: Valid registration creates an account', () => {
  // Feature: lifetrack-app, Property 1: Valid registration creates an account

  test('for any valid email + in-range password, registerUser returns SessionTokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryValidEmail(),
        arbitraryPassword(8, 128),
        async (email, password) => {
          setupMockKnexInsert();

          const result = await registerUser({ email, password });

          // Must return SessionTokens (not a ValidationError or ConflictError)
          expect(result).not.toHaveProperty('error');

          const tokens = result as SessionTokens;
          expect(typeof tokens.accessToken).toBe('string');
          expect(tokens.accessToken.length).toBeGreaterThan(0);
          expect(typeof tokens.refreshToken).toBe('string');
          expect(tokens.refreshToken.length).toBeGreaterThan(0);
        },
      ),
    );
  });

  test('for any valid email + in-range password, the knex insert chain is called', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryValidEmail(),
        arbitraryPassword(8, 128),
        async (email, password) => {
          setupMockKnexInsert();

          await registerUser({ email, password });

          // knex('users') must have been called
          expect(mockKnexFn).toHaveBeenCalledWith('users');
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Password length validation rejects out-of-range lengths
// Validates: Requirements 1.3
// ---------------------------------------------------------------------------

describe('Property 2: Password length validation rejects out-of-range lengths', () => {
  // Feature: lifetrack-app, Property 2: Password length validation rejects out-of-range lengths

  test('for any password with length < 8 or length > 128, registerUser returns ValidationError', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryValidEmail(),
        // Out-of-range passwords: too short OR too long
        fc.oneof(
          fc.string({ maxLength: 7 }),
          fc.string({ minLength: 129, maxLength: 200 }),
        ),
        async (email, password) => {
          // Validation rejects before touching the DB, no DB setup needed
          const result = await registerUser({ email, password });

          // Must return a ValidationError
          expect(result).toHaveProperty('error', 'VALIDATION_ERROR');

          const err = result as ValidationError;
          expect(err.fields).toHaveProperty('password');
          expect(typeof err.message).toBe('string');
          expect(err.message.length).toBeGreaterThan(0);
        },
      ),
    );
  });

  test('for any out-of-range password, no DB insert is attempted', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryValidEmail(),
        fc.oneof(
          fc.string({ maxLength: 7 }),
          fc.string({ minLength: 129, maxLength: 200 }),
        ),
        async (email, password) => {
          mockKnexFn.mockClear();

          await registerUser({ email, password });

          // knex() should NOT have been called — validation fails before DB access
          expect(mockKnexFn).not.toHaveBeenCalled();
        },
      ),
    );
  });
});
