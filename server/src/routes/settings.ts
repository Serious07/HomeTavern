import { Router, Request, Response } from 'express';
import db from '../config/database';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

/**
 * GET /api/settings
 * Returns all settings for the authenticated user as a JSON object with key-value pairs
 */
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const settings = db.prepare('SELECT key, value FROM settings WHERE user_id = ?').all(userId) as Array<{ key: string; value: string | null }>;

    const result: Record<string, string | null> = {};
    for (const setting of settings) {
      result[setting.key] = setting.value;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('[Settings Route] Error getting settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/settings
 * Upserts a setting (INSERT if doesn't exist, UPDATE if it does)
 * Body: { "key": "sound_enabled", "value": "true" }
 */
router.put('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { key, value } = req.body;

    if (!key) {
      return res.status(400).json({ error: 'Setting key is required' });
    }

    const valueStr = value !== undefined && value !== null ? String(value) : null;

    const stmt = db.prepare(`
      INSERT INTO settings (user_id, key, value, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      RETURNING id, user_id, key, value, created_at, updated_at
    `);

    const setting = stmt.run(userId, key, valueStr);

    res.status(200).json(setting[0]);
  } catch (error) {
    console.error('[Settings Route] Error upserting setting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/settings?key=...
 * Deletes a specific setting for the authenticated user
 */
router.delete('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const key = req.query.key as string | undefined;

    if (!key) {
      return res.status(400).json({ error: 'Setting key query parameter is required' });
    }

    const result = db.prepare('DELETE FROM settings WHERE user_id = ? AND key = ?').run(userId, key);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.status(200).json({ message: 'Setting deleted successfully' });
  } catch (error) {
    console.error('[Settings Route] Error deleting setting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
