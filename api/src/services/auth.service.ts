import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import { getKnex, getRedis } from '../db/client';
import { seedBuiltinTrackers } from '../db/seeds/01_builtin_trackers';
import type { SessionTokens, ValidationError, ConflictError, AuthError, RateLimitError } from '../types';

export type { AuthError, RateLimitError };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BCRYPT_COST = 12;
const JWT_EXPIRY = '15m';
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validates an email address according to RFC 5321 basics:
 *  - Non-empty local part
 *  - A single '@'
 *  - Non-empty domain with at least one '.'
 *  - Total length ≤ 254 characters
 */
function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  if (email.length > 254) return false;

  // Basic RFC 5321 structural check:
  //   - local part: one or more non-@ chars
  //   - @
  //   - domain: one or more non-@ chars, containing at least one '.'
  const emailRegex = /^[^@]+@[^@]+\.[^@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates password length: must be between 8 and 128 characters inclusive.
 */
function isValidPassword(password: string): boolean {
  if (typeof password !== 'string') return false;
  return password.length >= 8 && password.length <= 128;
}

// ---------------------------------------------------------------------------
// registerUser
// ---------------------------------------------------------------------------

/**
 * Registers a new user account.
 *
 * Steps:
 *  1. Validate email format and password length.
 *  2. Hash the password with bcrypt (cost 12).
 *  3. Insert the user row into `users`; detect duplicate-email conflicts.
 *  4. Seed built-in Mood and Energy trackers for the new user.
 *  5. Issue a 15-min JWT access token and a 30-day opaque refresh token.
 *  6. Store the refresh token in Redis with a 30-day TTL.
 *  7. Return the session tokens.
 *
 * Requirements: 1.1, 1.2, 1.3
 */
export async function registerUser(
  req: RegisterRequest,
): Promise<SessionTokens | ValidationError | ConflictError> {
  const { email, password } = req;

  // ---- 1. Validate inputs ----
  const fields: Record<string, string> = {};

  if (!isValidEmail(email)) {
    fields['email'] = 'A valid email address is required (e.g. user@example.com, max 254 characters)';
  }

  if (!isValidPassword(password)) {
    fields['password'] = 'Password must be between 8 and 128 characters';
  }

  if (Object.keys(fields).length > 0) {
    const firstMessage = Object.values(fields)[0]!;
    return {
      error: 'VALIDATION_ERROR',
      message: firstMessage,
      fields,
    } satisfies ValidationError;
  }

  // ---- 2. Hash password ----
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  // ---- 3. Insert user ----
  const knex = getKnex();

  let userId: string;

  try {
    const [inserted] = await knex('users')
      .insert({ email: email.toLowerCase(), password_hash: passwordHash })
      .returning('id');

    if (!inserted || typeof inserted !== 'object' || !('id' in inserted)) {
      throw new Error('Insert did not return a user id');
    }

    userId = (inserted as { id: string }).id;
  } catch (err: unknown) {
    // PostgreSQL unique-violation error code
    if (
      err instanceof Error &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === '23505'
    ) {
      return {
        error: 'CONFLICT',
        message: 'Email already in use',
      } satisfies ConflictError;
    }
    throw err;
  }

  // ---- 4. Seed built-in trackers ----
  await seedBuiltinTrackers(knex, userId);

  // ---- 5. Issue JWT access token ----
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  const accessToken = jwt.sign({ sub: userId, email: email.toLowerCase() }, jwtSecret, {
    expiresIn: JWT_EXPIRY,
  });

  // ---- 6. Issue opaque refresh token and store in Redis ----
  const refreshToken = crypto.randomUUID();
  const redis = getRedis();

  await redis.set(`refresh:${refreshToken}`, userId, 'EX', REFRESH_TOKEN_TTL_SECONDS);

  // ---- 7. Return session tokens ----
  return {
    accessToken,
    refreshToken,
  } satisfies SessionTokens;
}

// ---------------------------------------------------------------------------
// loginUser
// ---------------------------------------------------------------------------

/**
 * Authenticates a user by email and password.
 *
 * Steps:
 *  1. Look up user by lowercased email.
 *  2. If not found OR bcrypt compare fails → return generic AuthError (Req 1.5).
 *  3. Issue a new 15-min JWT + 30-day refresh token; store refresh token in Redis.
 *  4. Return SessionTokens.
 *
 * Requirements: 1.4, 1.5
 */
export async function loginUser(req: LoginRequest): Promise<SessionTokens | AuthError> {
  const { email, password } = req;
  const knex = getKnex();

  // ---- 1. Look up user ----
  const user = await knex('users')
    .where({ email: email.toLowerCase() })
    .select('id', 'email', 'password_hash')
    .first() as { id: string; email: string; password_hash: string } | undefined;

  // ---- 2. Generic error for missing user or bad password (Req 1.5) ----
  const INVALID_CREDENTIALS: AuthError = {
    error: 'AUTH_ERROR',
    message: 'Invalid credentials',
  };

  if (!user) {
    // Run a dummy bcrypt compare to prevent timing-based user enumeration
    await bcrypt.compare(password, '$2b$12$invalidhashinvalidhashinvalidhashXXXXXXXXXXXXXX');
    return INVALID_CREDENTIALS;
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    return INVALID_CREDENTIALS;
  }

  // ---- 3. Issue tokens ----
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  const accessToken = jwt.sign(
    { sub: user.id, email: user.email },
    jwtSecret,
    { expiresIn: JWT_EXPIRY },
  );

  const refreshToken = crypto.randomUUID();
  const redis = getRedis();

  await redis.set(`refresh:${refreshToken}`, user.id, 'EX', REFRESH_TOKEN_TTL_SECONDS);

  // ---- 4. Return tokens ----
  return {
    accessToken,
    refreshToken,
  } satisfies SessionTokens;
}

// ---------------------------------------------------------------------------
// refreshSession
// ---------------------------------------------------------------------------

/**
 * Rotates a refresh token and issues a new access token (sliding window, Req 1.6).
 *
 * Steps:
 *  1. Look up `refresh:<token>` in Redis → get userId.
 *  2. If not found → return AuthError.
 *  3. Delete old key; generate new refresh token UUID; store with 30-day TTL.
 *  4. Re-fetch user email from DB for JWT payload.
 *  5. Return new SessionTokens.
 *
 * Requirements: 1.6
 */
export async function refreshSession(refreshToken: string): Promise<SessionTokens | AuthError> {
  const redis = getRedis();

  // ---- 1. Look up refresh token in Redis ----
  const userId = await redis.get(`refresh:${refreshToken}`);

  if (!userId) {
    return {
      error: 'AUTH_ERROR',
      message: 'Invalid or expired refresh token',
    } satisfies AuthError;
  }

  // ---- 3. Rotate token: delete old, create new ----
  await redis.del(`refresh:${refreshToken}`);

  const newRefreshToken = crypto.randomUUID();
  await redis.set(`refresh:${newRefreshToken}`, userId, 'EX', REFRESH_TOKEN_TTL_SECONDS);

  // ---- 4. Re-fetch user email for JWT payload ----
  const knex = getKnex();
  const user = await knex('users')
    .where({ id: userId })
    .select('id', 'email')
    .first() as { id: string; email: string } | undefined;

  if (!user) {
    // User was deleted; clean up the new key we just created
    await redis.del(`refresh:${newRefreshToken}`);
    return {
      error: 'AUTH_ERROR',
      message: 'Invalid or expired refresh token',
    } satisfies AuthError;
  }

  // ---- 5. Issue new access token and return ----
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  const accessToken = jwt.sign(
    { sub: user.id, email: user.email },
    jwtSecret,
    { expiresIn: JWT_EXPIRY },
  );

  return {
    accessToken,
    refreshToken: newRefreshToken,
  } satisfies SessionTokens;
}

// ---------------------------------------------------------------------------
// logoutUser
// ---------------------------------------------------------------------------

/**
 * Invalidates a refresh token by deleting it from Redis.
 * Returns void even if the token was not found (idempotent).
 *
 * Requirements: 1.4
 */
export async function logoutUser(refreshToken: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`refresh:${refreshToken}`);
}

// ---------------------------------------------------------------------------
// requestPasswordReset
// ---------------------------------------------------------------------------

/**
 * Initiates a password reset for the given email.
 *
 * Steps:
 *  1. Check rate limit in Redis (max 3 per 60-min window per email). (Req 1.9)
 *  2. Look up user by email. If not found, return void silently to avoid
 *     revealing whether the email is registered. (Req 1.7)
 *  3. Generate a secure token (UUID v4 + 32 random bytes as hex).
 *  4. Insert row into `password_reset_tokens` with 24-hour expiry.
 *  5. Log the reset token to console (no real email service yet).
 *  6. Return void.
 *
 * Requirements: 1.7, 1.9
 */
export async function requestPasswordReset(email: string): Promise<void | RateLimitError> {
  const redis = getRedis();
  const normalizedEmail = email.toLowerCase();

  // ---- 1. Rate limit check ----
  const rateLimitKey = `pwdreset:ratelimit:${normalizedEmail}`;
  const count = await redis.incr(rateLimitKey);

  // Set expiry only on the first request in this window
  if (count === 1) {
    await redis.expire(rateLimitKey, 3600);
  }

  if (count > 3) {
    const retryAfter = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    return {
      error: 'RATE_LIMIT',
      message: 'Too many password reset requests. Please wait before trying again.',
      retryAfter,
    } satisfies RateLimitError;
  }

  // ---- 2. Look up user (silent no-op if not found — Req 1.7) ----
  const knex = getKnex();
  const user = await knex('users')
    .where({ email: normalizedEmail })
    .select('id')
    .first() as { id: string } | undefined;

  if (!user) {
    // Do not reveal whether the email exists
    return;
  }

  // ---- 3. Generate secure token ----
  const token = `${crypto.randomUUID()}${crypto.randomBytes(32).toString('hex')}`;

  // ---- 4. Insert into password_reset_tokens ----
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await knex('password_reset_tokens').insert({
    token,
    user_id: user.id,
    expires_at: expiresAt,
  });

  // ---- 5. Log reset link (no real email service yet) ----
  console.log('Password reset token:', token);

  // ---- 6. Return void ----
}

// ---------------------------------------------------------------------------
// confirmPasswordReset
// ---------------------------------------------------------------------------

/**
 * Completes a password reset using a previously issued token.
 *
 * Steps:
 *  1. Look up token in `password_reset_tokens`.
 *  2. Reject if not found, already used, or expired. (Req 1.8)
 *  3. Validate new password length (8–128).
 *  4. Hash new password with bcrypt (cost 12).
 *  5. Update `users.password_hash` for the token's user.
 *  6. Mark token as used by setting `used_at = now()`.
 *  7. Return void.
 *
 * Requirements: 1.8
 */
export async function confirmPasswordReset(
  token: string,
  newPassword: string,
): Promise<void | ValidationError | AuthError> {
  const knex = getKnex();

  // ---- 1 & 2. Look up token and validate it ----
  const resetToken = await knex('password_reset_tokens')
    .where({ token })
    .select('token', 'user_id', 'used_at', 'expires_at')
    .first() as { token: string; user_id: string; used_at: string | null; expires_at: string } | undefined;

  const INVALID_TOKEN: AuthError = {
    error: 'AUTH_ERROR',
    message: 'Invalid or expired reset token',
  };

  if (!resetToken) {
    return INVALID_TOKEN;
  }

  // Reject if already used (Req 1.8)
  if (resetToken.used_at !== null) {
    return INVALID_TOKEN;
  }

  // Reject if expired (Req 1.8)
  if (new Date(resetToken.expires_at) < new Date()) {
    return INVALID_TOKEN;
  }

  // ---- 3. Validate new password length ----
  if (!isValidPassword(newPassword)) {
    return {
      error: 'VALIDATION_ERROR',
      message: 'Password must be between 8 and 128 characters',
      fields: { password: 'Password must be between 8 and 128 characters' },
    } satisfies ValidationError;
  }

  // ---- 4. Hash new password ----
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

  // ---- 5. Update user password ----
  await knex('users')
    .where({ id: resetToken.user_id })
    .update({ password_hash: passwordHash });

  // ---- 6. Mark token as used ----
  await knex('password_reset_tokens')
    .where({ token })
    .update({ used_at: new Date() });

  // ---- 7. Return void ----
}
