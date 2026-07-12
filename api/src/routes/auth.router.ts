/**
 * Auth routes: register, login, refresh, logout, password-reset, password-reset/confirm
 * Requirements: 1.1–1.9
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import {
  registerUser,
  loginUser,
  refreshSession,
  logoutUser,
  requestPasswordReset,
  confirmPasswordReset,
} from '../services/auth.service';

const router = Router();

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'email and password are required',
      fields: {
        ...(!email ? { email: 'Email is required' } : {}),
        ...(!password ? { password: 'Password is required' } : {}),
      },
    });
    return;
  }

  const result = await registerUser({ email, password });

  if ('error' in result) {
    const status = result.error === 'CONFLICT' ? 409 : 400;
    res.status(status).json(result);
    return;
  }

  res.status(201).json(result);
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'email and password are required',
      fields: {
        ...(!email ? { email: 'Email is required' } : {}),
        ...(!password ? { password: 'Password is required' } : {}),
      },
    });
    return;
  }

  const result = await loginUser({ email, password });

  if ('error' in result) {
    res.status(401).json(result);
    return;
  }

  res.status(200).json(result);
});

// POST /auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'refreshToken is required',
      fields: { refreshToken: 'Refresh token is required' },
    });
    return;
  }

  const result = await refreshSession(refreshToken);

  if ('error' in result) {
    res.status(401).json(result);
    return;
  }

  res.status(200).json(result);
});

// POST /auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (refreshToken) {
    await logoutUser(refreshToken);
  }

  res.status(204).send();
});

// POST /auth/password-reset
router.post('/password-reset', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };

  if (!email) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'email is required',
      fields: { email: 'Email is required' },
    });
    return;
  }

  const result = await requestPasswordReset(email);

  if (result && 'error' in result) {
    res.status(429).json(result);
    return;
  }

  res.status(202).send();
});

// POST /auth/password-reset/confirm
router.post('/password-reset/confirm', async (req: Request, res: Response) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };

  if (!token || !newPassword) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'token and newPassword are required',
      fields: {
        ...(!token ? { token: 'Reset token is required' } : {}),
        ...(!newPassword ? { newPassword: 'New password is required' } : {}),
      },
    });
    return;
  }

  const result = await confirmPasswordReset(token, newPassword);

  if (result && 'error' in result) {
    const status = result.error === 'VALIDATION_ERROR' ? 400 : 401;
    res.status(status).json(result);
    return;
  }

  res.status(204).send();
});

export default router;
