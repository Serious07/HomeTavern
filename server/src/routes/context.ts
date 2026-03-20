/**
 * Context Routes - API endpoints для работы с контекстом и токенами
 */

import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { contextService, ContextStats } from '../services/context.service';

const router = Router();

// Все роуты требуют аутентификации
router.use(authenticate);

/**
 * GET /api/context/stats/:chatId
 * Получение статистики использования токенов для конкретного чата
 * 
 * Query параметры:
 * - force: boolean - принудительная синхронизация с llama.cpp
 * 
 * Ответ:
 * {
 *   tokensUsed: number;
 *   contextLimit: number;
 *   percentage: number;
 *   cached: boolean;
 *   slotId: number | null;
 *   lastSynced: string | null;
 * }
 */
router.get('/stats/:chatId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);
    const forceSync = req.query.force === 'true';

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chatId' });
    }

    // Проверяем доступ к чату
    const { chatRepository } = require('../repositories/chat.repository');
    const chat = chatRepository.getChatById(chatId);
    if (!chat || chat.user_id !== userId) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    // Получаем статистику
    const stats: ContextStats = await contextService.getChatContextStats(chatId, userId, forceSync);

    res.status(200).json(stats);
  } catch (error) {
    console.error('[ContextRoutes] Error getting context stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/context/sync/:chatId
 * Принудительная синхронизация с llama.cpp
 */
router.post('/sync/:chatId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chatId' });
    }

    // Проверяем доступ к чату
    const { chatRepository } = require('../repositories/chat.repository');
    const chat = chatRepository.getChatById(chatId);
    if (!chat || chat.user_id !== userId) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    // Принудительная синхронизация
    const stats: ContextStats = await contextService.forceSync(chatId, userId);

    res.status(200).json(stats);
  } catch (error) {
    console.error('[ContextRoutes] Error syncing context:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/context/slots
 * Получение списка активных слотов llama.cpp
 */
router.get('/slots', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const slots = await contextService.getActiveSlots();
    res.status(200).json({ slots });
  } catch (error) {
    console.error('[ContextRoutes] Error getting slots:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/context/props
 * Получение общих настроек llama.cpp сервера
 */
router.get('/props', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const n_ctx = await contextService.getMaxContext();
    res.status(200).json({ n_ctx });
  } catch (error) {
    console.error('[ContextRoutes] Error getting props:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
