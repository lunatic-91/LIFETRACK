/**
 * Entry routes: log, list, edit — nested under /trackers/:id/entries
 * Requirements: 3.1-3.9
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { logEntry, listEntries, editEntry } from '../services/entry.service';

const router = Router({ mergeParams: true });

router.use(requireAuth);

// POST /trackers/:id/entries
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const trackerId = req.params['id']!;

  const result = await logEntry(userId, trackerId, req.body);

  if ('error' in result) {
    const status =
      result.error === 'NOT_FOUND' ? 404 : result.error === 'CONFLICT' ? 409 : 400;
    res.status(status).json(result);
    return;
  }

  if (result.noteTruncated) {
    res.set('X-Note-Truncated', 'true');
  }
  res.status(201).json(result.entry);
});

// GET /trackers/:id/entries
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const trackerId = req.params['id']!;
  const { start, end, limit, offset } = req.query as Record<string, string | undefined>;

  const entries = await listEntries(userId, trackerId, {
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(limit ? { limit: Number(limit) } : {}),
    ...(offset ? { offset: Number(offset) } : {}),
  });

  res.status(200).json(entries);
});

// PATCH /trackers/:id/entries/:eid
router.patch('/:eid', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const trackerId = req.params['id']!;
  const entryId = req.params['eid']!;

  const result = await editEntry(userId, trackerId, entryId, req.body);

  if ('error' in result) {
    const status = result.error === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json(result);
    return;
  }

  if (result.noteTruncated) {
    res.set('X-Note-Truncated', 'true');
  }
  res.status(200).json(result.entry);
});

export default router;
