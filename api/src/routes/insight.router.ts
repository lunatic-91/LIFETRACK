/**
 * Insight route
 * Requirements: 9.3
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { listInsights } from '../services/insight.service';

const router = Router();

router.use(requireAuth);

// GET /insights
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const insights = await listInsights(userId);
  res.status(200).json(insights);
});

export default router;
