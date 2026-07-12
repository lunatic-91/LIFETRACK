/**
 * Export routes
 * Requirements: 10.1-10.9
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { generateExport, getExportJobStatus } from '../services/export.service';

const router = Router();

router.use(requireAuth);

// POST /exports
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;

  try {
    const result = await generateExport(userId, req.body);

    if (result.status === 'processing') {
      res.status(202).json(result);
      return;
    }

    if (result.entryCount === 0) {
      res.status(200).json({ ...result, message: 'No entries matched the given filter' });
      return;
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({
      error: 'EXPORT_FAILED',
      message: `Export could not be completed: ${err instanceof Error ? err.message : 'unknown error'}`,
    });
  }
});

// GET /exports/:jobId
router.get('/:jobId', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const status = await getExportJobStatus(userId, req.params['jobId']!);

  if (!status) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Export job not found' });
    return;
  }

  res.status(200).json(status);
});

export default router;
