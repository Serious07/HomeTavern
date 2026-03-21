/**
 * Compression API Endpoints
 */

import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { compressionService } from '../services/compression.service';
import { chatBlockRepository, ChatBlock } from '../repositories/chat-block.repository';
import { contextService } from '../services/context.service';
import { translationService } from '../services/translation.service';

const router = Router();

// Все роуты требуют аутентификации
router.use(authenticate);

/**
 * POST /api/compression/compress/:chatId
 * Запустить сжатие истории для чата (автоматический режим)
 * Response: { success: boolean, blocks: ChatBlock[], originalCount: number, compressedCount: number, tokenSavings: number }
 */
router.post('/compress/:chatId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chatId' });
    }

    const result = await compressionService.compressChat(chatId, userId);

    res.status(200).json({
      success: true,
      blocks: result.blocks,
      originalCount: result.originalCount,
      compressedCount: result.compressedCount,
      tokenSavings: result.tokenSavings
    });
  } catch (error) {
    console.error('[CompressionRoute] Error compressing chat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/compression/compress-selected/:chatId
 * Запустить сжатие выделенного диапазона
 * Body: { startMessageId: number, endMessageId: number }
 * Response: { success: boolean, block: ChatBlock }
 */
router.post('/compress-selected/:chatId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);
    const { startMessageId, endMessageId } = req.body;

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chatId' });
    }

    if (!startMessageId || !endMessageId) {
      return res.status(400).json({ error: 'startMessageId and endMessageId are required' });
    }

    const block = await compressionService.compressSelectedRange(
      chatId,
      userId,
      startMessageId,
      endMessageId
    );

    res.status(200).json({
      success: true,
      block
    });
  } catch (error) {
    console.error('[CompressionRoute] Error compressing selected range:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/compression/blocks/:chatId
 * Получить все блоки сжатия для чата
 * Response: ChatBlock[]
 */
router.get('/blocks/:chatId', (req: AuthenticatedRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.chatId, 10);

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chatId' });
    }

    const blocks = chatBlockRepository.getBlocksByChatId(chatId);
    res.status(200).json(blocks);
  } catch (error) {
    console.error('[CompressionRoute] Error getting blocks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/compression/block/:id
 * Обновить блок (редактирование summary, включение/выключение сжатия)
 * Body: { title?: string, summary?: string, is_compressed?: boolean }
 * Response: ChatBlock
 */
router.put('/block/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const blockId = parseInt(req.params.id, 10);
    const { title, summary, is_compressed } = req.body;

    if (isNaN(blockId)) {
      return res.status(400).json({ error: 'Invalid blockId' });
    }

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (summary !== undefined) updates.summary = summary;
    if (is_compressed !== undefined) updates.is_compressed = is_compressed ? 1 : 0;

    const block = chatBlockRepository.updateBlock(blockId, updates);

    if (!block) {
      return res.status(404).json({ error: 'Block not found' });
    }

    res.status(200).json(block);
  } catch (error) {
    console.error('[CompressionRoute] Error updating block:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/compression/block/:id
 * Удалить блок сжатия
 * Response: { success: boolean }
 */
router.delete('/block/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const blockId = parseInt(req.params.id, 10);

    if (isNaN(blockId)) {
      return res.status(400).json({ error: 'Invalid blockId' });
    }

    const deleted = chatBlockRepository.deleteBlock(blockId);

    if (!deleted) {
      return res.status(404).json({ error: 'Block not found' });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[CompressionRoute] Error deleting block:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/compression/undo/:chatId
 * Откатить последнее сжатие (удалить последний блок)
 * Response: { success: boolean }
 */
router.post('/undo/:chatId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.chatId, 10);

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chatId' });
    }

    const success = await compressionService.undoLastCompression(chatId);

    res.status(200).json({ success });
  } catch (error) {
    console.error('[CompressionRoute] Error undoing compression:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/compression/reset/:chatId
 * Сбросить все блоки сжатия для чата (восстановить полную историю)
 * Response: { success: boolean }
 */
router.delete('/reset/:chatId', (req: AuthenticatedRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.chatId, 10);

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chatId' });
    }

    const deleted = chatBlockRepository.deleteBlocksByChatId(chatId);

    res.status(200).json({ success: deleted });
  } catch (error) {
    console.error('[CompressionRoute] Error resetting compression:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/compression/needs/:chatId
 * Проверить необходимость сжатия
 * Response: { needsCompression: boolean, percentage: number }
 */
router.get('/needs/:chatId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chatId' });
    }

    const result = await compressionService.needsCompression(chatId, userId);
    res.status(200).json(result);
  } catch (error) {
    console.error('[CompressionRoute] Error checking compression needs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/compression/block/:id/translate
 * Перевести блок на другой язык (русский)
 * Response: ChatBlock с обновленными полями summary_translation и title_translation
 */
router.put('/block/:id/translate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const blockId = parseInt(req.params.id, 10);

    if (isNaN(blockId)) {
      return res.status(400).json({ error: 'Invalid blockId' });
    }

    const block = chatBlockRepository.getBlockById(blockId);
    if (!block) {
      return res.status(404).json({ error: 'Block not found' });
    }

    // Переводим summary и title на русский язык
    let summaryTranslation: string | null = null;
    let titleTranslation: string | null = null;

    try {
      const summaryTranslationResult = await translationService.translate(block.summary, { targetLang: 'ru' });
      summaryTranslation = summaryTranslationResult.translatedText || block.summary;
    } catch (error) {
      console.error('[CompressionRoute] Error translating summary:', error);
      summaryTranslation = block.summary; // Fallback to original
    }

    try {
      const titleTranslationResult = await translationService.translate(block.title, { targetLang: 'ru' });
      titleTranslation = titleTranslationResult.translatedText || block.title;
    } catch (error) {
      console.error('[CompressionRoute] Error translating title:', error);
      titleTranslation = block.title; // Fallback to original
    }

    // Обновляем блок в БД
    const updatedBlock = chatBlockRepository.updateBlock(blockId, {
      summary_translation: summaryTranslation,
      title_translation: titleTranslation,
    });

    res.status(200).json(updatedBlock);
  } catch (error) {
    console.error('[CompressionRoute] Error translating block:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
