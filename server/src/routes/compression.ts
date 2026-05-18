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
 * Query: method=fixed|semantic (опционально, по умолчанию fixed)
 * Response: { success: boolean, blocks: ChatBlock[], originalCount: number, compressedCount: number, tokenSavings: number }
 */
router.post('/compress/:chatId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chatId' });
    }

    const method = req.query.method as 'fixed' | 'semantic' | undefined;

    const result = await compressionService.compressChat(chatId, userId, {
      compressionMethod: method || 'fixed'
    });

    res.status(200).json({
      success: true,
      blocks: result.blocks,
      originalCount: result.originalCount,
      compressedCount: result.compressedCount,
      tokenSavings: result.tokenSavings
    });
  } catch (error) {
    console.error('[CompressionRoute] Error compressing chat:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/compression/compress-stream/:chatId
 * Запустить сжатие истории для чата с возвратом прогресса через SSE (Server-Sent Events)
 * Response: Stream of SSE events (text/event-stream)
 * Query params: token (for authentication)
 */
router.get('/compress-stream/:chatId', async (req: AuthenticatedRequest, res: Response) => {
  console.log('[CompressStream] >>> Incoming request for chatId:', req.params.chatId);
  console.log('[CompressStream] >>> User:', req.user?.username);
  console.log('[CompressStream] >>> Headers:', JSON.stringify(req.headers));

  // Проверяем валидность chatId ДО отправки заголовков
  const chatId = parseInt(req.params.chatId, 10);

  if (isNaN(chatId)) {
    console.log('[CompressStream] >>> Invalid chatId');
    res.setHeader('Content-Type', 'application/json');
    return res.status(400).json({ error: 'Invalid chatId' });
  }

  // Проверяем аутентификацию ДО отправки заголовков
  if (!req.user) {
    console.log('[CompressStream] >>> No user - returning 401');
    res.setHeader('Content-Type', 'application/json');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.user.userId;
  console.log('[CompressStream] >>> chatId:', chatId, ', userId:', userId);

  // Устанавливаем заголовки для SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  console.log('[CompressStream] >>> Setting SSE headers and flushing...');
  res.flushHeaders?.();
  console.log('[CompressStream] >>> Headers flushed successfully');

  // Функция для отправки SSE событий
  const sendEvent = (data: Record<string, any>) => {
    const eventData = JSON.stringify(data);
    console.log('[CompressStream] >>> Sending event:', eventData.substring(0, 200));
    res.write(`data: ${eventData}\n\n`);
  };

  // Функция для завершения SSE соединения с ошибкой
  const errorStream = (errorMessage: string) => {
    const eventData = JSON.stringify({ type: 'error', error: errorMessage });
    res.write(`data: ${eventData}\n\n`);
    res.write('event: error\n\n');
    res.end();
  };

  // Функция для завершения SSE соединения
  const finishStream = (data: Record<string, any>) => {
    const eventData = JSON.stringify(data);
    res.write(`data: ${eventData}\n\n`);
    res.write('event: complete\n\n');
    res.end();
  };

  // Создаём callback для прогресса
  const onProgress = (progress: any) => {
    sendEvent({
      type: 'progress',
      currentBlock: progress.currentBlock,
      totalBlocks: progress.totalBlocks,
      status: progress.status,
      title: progress.title
    });
  };

  // Отправляем начальное событие подключения
  console.log('[CompressStream] >>> Sending connected event...');
  sendEvent({ type: 'connected', status: 'Подключение установлено' });

  try {
    console.log('[CompressStream] >>> Starting compression service...');
    // Запускаем сжатие с callback для прогресса
    const method = req.query.method as 'fixed' | 'semantic' | undefined;
    const result = await compressionService.compressChat(chatId, userId, { compressionMethod: method || 'fixed', onProgress });

    // Отправляем финальное событие
    finishStream({
      type: 'complete',
      success: true,
      blocks: result.blocks,
      originalCount: result.originalCount,
      compressedCount: result.compressedCount,
      tokenSavings: result.tokenSavings
    });
  } catch (error) {
    console.error('[CompressStream] >>> Error during compression:', error);
    console.error('[CompressionRoute] Error compressing chat (stream):', error);
    // Пытаемся отправить ошибку, если заголовки ещё не отправлены
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: 'Internal server error' });
    } else {
      errorStream('Internal server error');
    }
  }
});

/**
 * POST /api/compression/compress-selected/:chatId
 * Запустить сжатие выделенного диапазона (устаревший, без прогресса)
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
 * GET /api/compression/compress-selected-stream/:chatId
 * Запустить сжатие выделенного диапазона с прогрессом через SSE
 * Query: startMessageId, endMessageId
 */
router.get('/compress-selected-stream/:chatId', async (req: AuthenticatedRequest, res: Response) => {
  const chatId = parseInt(req.params.chatId, 10);
  const startMessageId = parseInt(req.query.startMessageId as string, 10);
  const endMessageId = parseInt(req.query.endMessageId as string, 10);

  if (isNaN(chatId) || isNaN(startMessageId) || isNaN(endMessageId)) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  if (!req.user) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.user.userId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (data: Record<string, any>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const finishStream = (data: Record<string, any>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    res.write('event: complete\n\n');
    res.end();
  };

  const errorStream = (errorMessage: string) => {
    res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
    res.end();
  };

  // Отправляем начальный прогресс: 1 блок всего
  sendEvent({ type: 'connected', status: 'Подключение установлено' });
  sendEvent({
    type: 'progress',
    currentBlock: 0,
    totalBlocks: 1,
    status: 'Начало сжатия...'
  });

  try {
    sendEvent({
      type: 'progress',
      currentBlock: 0,
      totalBlocks: 1,
      status: 'Обработка блока 1 из 1...'
    });

    const block = await compressionService.compressSelectedRange(
      chatId,
      userId,
      startMessageId,
      endMessageId
    );

    sendEvent({
      type: 'progress',
      currentBlock: 1,
      totalBlocks: 1,
      status: 'Обработан блок 1 из 1',
      title: block.title
    });

    finishStream({
      type: 'complete',
      success: true,
      block
    });
  } catch (error) {
    console.error('[CompressionRoute] Error compressing selected range (stream):', error);
    errorStream('Internal server error');
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
