import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { getQuickRepliesByUserId, replaceQuickReplies } from '../repositories/quick-reply.repository';

const router = Router();

export const MAX_QUICK_REPLIES = 5;
export const MAX_QUICK_REPLY_LENGTH = 500;

// Список показывается в модалке «Быстрый ответ», поэтому хотя бы один
// вариант должен быть всегда. Когда пользователь ещё ничего не настраивал,
// отдаём дефолт, не записывая его в базу.
export const DEFAULT_QUICK_REPLIES = ['Продолжение истории'];

/**
 * GET /api/quick-replies
 * Возвращает быстрые ответы пользователя (дефолтный список, если ещё не настроены)
 */
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const rows = getQuickRepliesByUserId(userId);

    const quickReplies = rows.length > 0
      ? rows.map((row) => row.message)
      : DEFAULT_QUICK_REPLIES;

    res.status(200).json({ quickReplies });
  } catch (error) {
    console.error('[Quick Replies Route] Error getting quick replies:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/quick-replies
 * Полностью заменяет список быстрых ответов пользователя
 * Body: { "replies": ["Продолжение истории", "..."] }
 * Правила: от 1 до 5 непустых строк (валидация и на клиенте, и здесь)
 */
router.put('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { replies } = req.body as { replies?: unknown };

    if (!Array.isArray(replies)) {
      return res.status(400).json({ error: 'replies must be an array of strings' });
    }

    if (replies.length < 1) {
      return res.status(400).json({ error: 'At least one quick reply is required' });
    }

    if (replies.length > MAX_QUICK_REPLIES) {
      return res.status(400).json({ error: `Maximum ${MAX_QUICK_REPLIES} quick replies are allowed` });
    }

    const cleaned: string[] = [];
    for (const reply of replies) {
      if (typeof reply !== 'string') {
        return res.status(400).json({ error: 'Each quick reply must be a string' });
      }
      const trimmed = reply.trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'Quick reply cannot be empty' });
      }
      if (trimmed.length > MAX_QUICK_REPLY_LENGTH) {
        return res.status(400).json({ error: `Quick reply cannot exceed ${MAX_QUICK_REPLY_LENGTH} characters` });
      }
      cleaned.push(trimmed);
    }

    const rows = replaceQuickReplies(userId, cleaned);

    res.status(200).json({ quickReplies: rows.map((row) => row.message) });
  } catch (error) {
    console.error('[Quick Replies Route] Error saving quick replies:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
