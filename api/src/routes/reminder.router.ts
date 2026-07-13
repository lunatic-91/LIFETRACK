/**
 * Reminder routes
 * Requirements: 8.1-8.5
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import {
  createReminder,
  listReminders,
  updateReminder,
  deleteReminder,
  setGlobalEnabled,
} from '../services/notification.service';

const router = Router();

router.use(requireAuth);

// PATCH /reminders/global — registered before /:id so 'global' is never
// swallowed as a Reminder id.
router.patch('/global', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const enabled = Boolean((req.body as { enabled?: unknown }).enabled);
  const result = await setGlobalEnabled(userId, enabled);
  res.status(200).json(result);
});

// POST /reminders
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const result = await createReminder(userId, req.body);

  if ('error' in result) {
    res.status(400).json(result);
    return;
  }

  res.status(201).json(result);
});

// GET /reminders
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const reminders = await listReminders(userId);
  res.status(200).json(reminders);
});

// PATCH /reminders/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const result = await updateReminder(userId, req.params['id']!, req.body);

  if ('error' in result) {
    const status = result.error === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json(result);
    return;
  }

  res.status(200).json(result);
});

// DELETE /reminders/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const result = await deleteReminder(userId, req.params['id']!);

  if (result !== true) {
    res.status(404).json(result);
    return;
  }

  res.status(204).send();
});

export default router;
