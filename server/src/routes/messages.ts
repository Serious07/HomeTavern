import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { messageService } from '../services/message.service';
import { chatService } from '../services/chat.service';
import {
  detectLanguage,
  getTranslationService,
} from '../services/translation.service';
import {
  translateEditIncremental,
  translateEditIncrementalStream,
  IncrementalOutcome,
} from '../services/incremental-translation.service';
import { EditedField } from '../utils/text-segments';
import { messageRepository, UpdateMessageParams } from '../repositories/message.repository';
import { chatRepository } from '../repositories/chat.repository';
import db from '../config/database';

const router = Router();

// Все роуты требуют аутентификации
router.use(authenticate);

/**
 * GET /api/chats/:chatId/messages
 * Получение сообщений чата
 */
router.get('/chats/:chatId/messages', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    const messages = messageService.getMessagesByChatId(chatId, userId);
    res.status(200).json(messages);
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    const statusCode = error_.statusCode || 400;
    res.status(statusCode).json({ error: error_.message });
  }
});

/**
 * POST /api/chats/:chatId/messages
 * Создание сообщения
 * Body: { role: string, content: string, translated_content?: string }
 */
router.post('/chats/:chatId/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);
    const { role, content, translated_content } = req.body;

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    if (!role || !content) {
      return res.status(400).json({ error: 'role and content are required' });
    }

    // 2.3: Перевод сообщения пользователя выполняется в chats.ts при стриминге (для UI)
    // Здесь мы просто сохраняем оригинальный контент, перевод будет добавлен позже
    const translatedContent = translated_content || null;

    const message = messageService.createMessage(chatId, userId, role, content, translatedContent);
    res.status(201).json(message);
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    const statusCode = error_.statusCode || 400;
    res.status(statusCode).json({ error: error_.message });
  }
});

/**
 * PUT /api/chats/:chatId/messages/:id
 * Обновление сообщения
 * Body: { role?: string, content?: string, translated_content?: string, message_id?: string }
 */
router.put('/chats/:chatId/messages/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);
    const messageId = parseInt(req.params.id, 10);
    const updates = req.body;

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    if (isNaN(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    const message = messageService.updateMessage(messageId, userId, updates);

    if (!message) {
      return res.status(404).json({ error: 'Message not found or access denied' });
    }

    res.status(200).json(message);
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    const statusCode = error_.statusCode || 400;
    res.status(statusCode).json({ error: error_.message });
  }
});

/**
 * DELETE /api/chats/:chatId/messages/:id
 * Удаление сообщения
 */
router.delete('/chats/:chatId/messages/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);
    const messageId = parseInt(req.params.id, 10);

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    if (isNaN(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    const deleted = messageService.deleteMessage(messageId, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Message not found or access denied' });
    }

    res.status(200).json({ message: 'Message deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/chats/:chatId/messages/:id/hide
 * Скрытие сообщения
 */
router.put('/chats/:chatId/messages/:id/hide', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);
    const messageId = parseInt(req.params.id, 10);

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    if (isNaN(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    const message = messageService.hideMessage(messageId, userId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found or access denied' });
    }

    res.status(200).json(message);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/chats/:chatId/messages/:id/show
 * Показ сообщения
 */
router.put('/chats/:chatId/messages/:id/show', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);
    const messageId = parseInt(req.params.id, 10);

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    if (isNaN(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    const message = messageService.showMessage(messageId, userId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found or access denied' });
    }

    res.status(200).json(message);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/chats/:chatId/messages/:id/translate
 * Перевод сообщения на русский язык
 */
router.post('/chats/:chatId/messages/:id/translate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);
    const messageId = parseInt(req.params.id, 10);

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    if (isNaN(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    const message = await messageService.translateMessage(messageId, userId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found or access denied' });
    }

    res.status(200).json(message);
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    const statusCode = error_.statusCode || 500;
    res.status(statusCode).json({ error: error_.message });
  }
});

/**
 * PUT /api/chats/:chatId/messages/:id/translate-bidirectional
 * Двунаправленный перевод при редактировании сообщения
 * Body: { content?: string, translated_content?: string }
 */
router.put('/chats/:chatId/messages/:id/translate-bidirectional', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);
    const messageId = parseInt(req.params.id, 10);
    const { content, translated_content } = req.body;

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    if (isNaN(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    // Получаем текущее сообщение через repository напрямую
    const message = messageRepository.getMessageById(messageId);
    if (!message || message.chat_id !== chatId) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Проверяем доступ к чату
    const chat = chatRepository.getChatById(chatId);
    if (!chat || chat.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // 2.5: Двунаправленный перевод (per-user с displayLang)
    const { settings: userSettings } = getTranslationService(userId);
    const displayLang = userSettings.displayLang;

    const updates: UpdateMessageParams = {};

    if (userSettings.enabled) {
      const isUserMessage = message.role === 'user';

      // Определяем, какая сторона редактируется, и направление перевода
      let editedField: EditedField | undefined;
      let newText: string | undefined;
      let srcLang: string = 'en';
      let tgtLang: string = 'en';

      if (content !== undefined && content !== message.content) {
        editedField = 'content';
        newText = content;
        if (isUserMessage) {
          // User: content = DisplayLang -> translated_content = EN
          srcLang = await detectLanguage(content);
          tgtLang = 'en';
        } else {
          // Assistant: content = EN -> translated_content = DisplayLang
          srcLang = 'en';
          tgtLang = displayLang;
        }
      } else if (translated_content !== undefined && translated_content !== message.translated_content && translated_content) {
        editedField = 'translated_content';
        newText = translated_content;
        if (isUserMessage) {
          // User: translated_content = EN -> content = DisplayLang
          srcLang = 'en';
          tgtLang = displayLang;
        } else {
          // Assistant: translated_content = DisplayLang -> content = EN
          srcLang = displayLang;
          tgtLang = 'en';
        }
      }

      if (editedField && newText !== undefined) {
        const outcome = await translateEditIncremental(userId, message, editedField, newText, srcLang, tgtLang);
        console.log(`[Bidirectional Translation] ${outcome.mode} edit of message ${messageId} (${srcLang}->${tgtLang}), field=${editedField}`);
        updates.content = outcome.content;
        updates.translated_content = outcome.translated_content;
        updates.translation_segments = outcome.translation_segments;
      }
    } else {
      // Перевод отключен — сохраняем переданные значения как есть, без перевода
      if (content !== undefined && content !== message.content) {
        updates.content = content;
      }
      if (translated_content !== undefined && translated_content !== message.translated_content) {
        updates.translated_content = translated_content;
      }
    }

    // Сохраняем в БД - передаем только поля для обновления
    const savedMessage = messageService.updateMessage(messageId, userId, updates);

    res.status(200).json(savedMessage);
  } catch (error) {
    console.error('[Bidirectional Translation] Error:', error);
    const error_ = error as Error & { statusCode?: number };
    const statusCode = error_.statusCode || 500;
    res.status(statusCode).json({ error: error_.message });
  }
});

/**
 * POST /api/chats/:chatId/messages/:id/translate-incremental
 * Инкрементальный перевод при редактировании сообщения (LLM-провайдер, SSE).
 * Переиспользованные абзацы выдаются мгновенно, переводятся только изменённые.
 * Body: { field: 'content' | 'translated_content', text: string }
 * Ответ: SSE { token } | { reasoningToken } | { done, fullText, message }
 */
router.post('/chats/:chatId/messages/:id/translate-incremental', async (req: AuthenticatedRequest, res: Response) => {
  let keepAliveTimer: NodeJS.Timeout | undefined;
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);
    const messageId = parseInt(req.params.id, 10);
    const { field, text } = req.body;

    if (isNaN(chatId) || isNaN(messageId)) {
      return res.status(400).json({ error: 'Invalid chat or message ID' });
    }

    if (field !== 'content' && field !== 'translated_content') {
      return res.status(400).json({ error: 'field must be content or translated_content' });
    }
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required' });
    }

    const message = messageRepository.getMessageById(messageId);
    if (!message || message.chat_id !== chatId) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const chat = chatRepository.getChatById(chatId);
    if (!chat || chat.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { settings: userSettings } = getTranslationService(userId);
    if (!userSettings.enabled) {
      return res.status(403).json({ error: 'Translation is disabled' });
    }

    const isUserMessage = message.role === 'user';
    const displayLang = userSettings.displayLang;
    let srcLang: string;
    let tgtLang: string;

    if (field === 'content') {
      if (isUserMessage) {
        srcLang = await detectLanguage(text);
        tgtLang = 'en';
      } else {
        srcLang = 'en';
        tgtLang = displayLang;
      }
    } else {
      if (isUserMessage) {
        srcLang = 'en';
        tgtLang = displayLang;
      } else {
        srcLang = displayLang;
        tgtLang = 'en';
      }
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let lastActivity = Date.now();
    keepAliveTimer = setInterval(() => {
      if (!res.writableEnded && Date.now() - lastActivity > 5000) {
        try { res.write(': keepalive\n\n'); } catch { /* ignore */ }
      }
    }, 1000);

    const stream = translateEditIncrementalStream(userId, message, field, text, srcLang, tgtLang);

    let outcome: IncrementalOutcome | undefined;
    for (;;) {
      const step = await stream.next();
      if (step.done) {
        outcome = step.value;
        break;
      }
      if (res.writableEnded) break; // Клиент отключился - не сохраняем частичный перевод
      lastActivity = Date.now();
      res.write(`data: ${JSON.stringify(step.value)}\n\n`);
    }

    if (!outcome) {
      console.log(`[IncrementalTranslation] Client disconnected during message ${messageId} edit, changes not saved`);
      return;
    }
    const savedMessage = messageService.updateMessage(messageId, userId, {
      content: outcome.content,
      translated_content: outcome.translated_content,
      translation_segments: outcome.translation_segments,
    });

    const fullText = field === 'content' ? outcome.translated_content : outcome.content;
    res.write(`data: ${JSON.stringify({ done: true, fullText, message: savedMessage })}\n\n`);
    res.end();
  } catch (error) {
    console.error('[IncrementalTranslation] Error:', error);
    if (!res.headersSent) {
      const error_ = error as Error & { statusCode?: number };
      res.status(error_.statusCode || 500).json({ error: error_.message });
    } else if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: 'Incremental translation failed' })}\n\n`);
      res.end();
    }
  } finally {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
  }
});

export default router;
