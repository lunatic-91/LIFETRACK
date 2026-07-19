/**
 * Tracker routes: create, list, update, archive, delete
 * Requirements: 2.1-2.10
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import {
  createTracker,
  listTrackers,
  updateTracker,
  archiveTracker,
  deleteTracker,
} from '../services/tracker.service';
import { getStreak } from '../services/streak.service';
import entryRouter from './entry.router';

const router = Router();

router.use(requireAuth);
router.use('/:id/entries', entryRouter);

// GET /trackers/:id/streak
router.get('/:id/streak', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const streak = await getStreak(userId, req.params['id']!);
  res.status(200).json(streak);
});

// POST /trackers
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const result = await createTracker(userId, req.body);

  if (result && 'error' in result) {
    const status = result.error === 'LIMIT_ERROR' ? 400 : 400;
    res.status(status).json(result);
    return;
  }

  res.status(201).json(result);
});

// GET /trackers
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const includeArchived = req.query['includeArchived'] === 'true';
  const trackers = await listTrackers(userId, { includeArchived });
  res.status(200).json(trackers);
});

// PATCH /trackers/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const result = await updateTracker(userId, req.params['id']!, req.body);

  if (result && 'error' in result) {
    const status = result.error === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json(result);
    return;
  }

  res.status(200).json(result);
});

// POST /trackers/:id/archive
router.post('/:id/archive', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const result = await archiveTracker(userId, req.params['id']!);

  if (result && 'error' in result) {
    res.status(404).json(result);
    return;
  }

  res.status(204).send();
});

// DELETE /trackers/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const result = await deleteTracker(userId, req.params['id']!);

  if (result && 'error' in result) {
    const status = result.error === 'NOT_FOUND' ? 404 : 409;
    res.status(status).json(result);
    return;
  }

  res.status(204).send();
});

export default router;
