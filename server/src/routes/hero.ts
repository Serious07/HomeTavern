import { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/hero
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ error: 'Not implemented' });
});

// PUT /api/hero
router.put('/', authenticate, (req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
