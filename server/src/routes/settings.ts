import { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/settings
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ error: 'Not implemented' });
});

// PUT /api/settings
router.put('/', authenticate, (req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
