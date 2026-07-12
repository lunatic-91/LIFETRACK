/**
 * Goal routes
 * Requirements: 5.1-5.9
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { createGoal, listGoals, updateGoal } from '../services/goal.service';

const router = Router();

router.use(requireAuth);

// POST /goals
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const result = await createGoal(userId, req.body);

  if ('error' in result) {
    const status = result.error === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json(result);
    return;
  }

  res.status(201).json(result);
});

// GET /goals
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const goals = await listGoals(userId);
  res.status(200).json(goals);
});

// PATCH /goals/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const result = await updateGoal(userId, req.params['id']!, req.body);

  if ('error' in result) {
    const status = result.error === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json(result);
    return;
  }

  res.status(200).json(result);
});

export default router;
