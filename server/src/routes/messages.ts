import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { messageService } from '../services/message.service';
import { chatService } from '../services/chat.service';
import {
  translateForUser,
  detectLanguage,
  getTranslationService,
  translationService,
} from '../services/translation.service';
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

    let updatedMessage = { ...message };

    // 2.5: Двунаправленный перевод (per-user с displayLang)
    const { settings: userSettings } = getTranslationService(userId);
    const displayLang = userSettings.displayLang;

    // Определяем роль сообщения для логики перевода
    const isUserMessage = message.role === 'user';

    // User сообщения: displayLang = content (оригинал), EN = translated_content (перевод)
    // Assistant сообщения: EN = content (оригинал), displayLang = translated_content (перевод)
    if (isUserMessage) {
      // Пользовательское сообщение
      if (content !== undefined && content !== message.content) {
        // Обновлен оригинал (displayLang) - переводим на EN
        try {
          const srcLang = await detectLanguage(content);
          const translation = await translateForUser(userId, content, srcLang, 'en');
          updatedMessage.content = content;
          updatedMessage.translated_content = translation;
          console.log(`[Bidirectional Translation] User message ${srcLang}->EN:`, translation.substring(0, 50));
        } catch (translateErr) {
          console.error('[Bidirectional Translation] Translation to English failed:', translateErr);
          updatedMessage.translated_content = message.translated_content;
        }
      }
      if (translated_content !== undefined && translated_content !== message.translated_content && translated_content) {
        // Обновлен перевод (EN) - переводим обратно на displayLang
        try {
          const translation = await translateForUser(userId, translated_content, 'en', displayLang);
          updatedMessage.content = translation;
          updatedMessage.translated_content = translated_content;
          console.log(`[Bidirectional Translation] User message EN->${displayLang}:`, translation.substring(0, 50));
        } catch (translateErr) {
          console.error('[Bidirectional Translation] Translation to displayLang failed:', translateErr);
          updatedMessage.content = message.content;
        }
      }
    } else {
      // Assistant сообщение
      if (content !== undefined && content !== message.content) {
        // Обновлен оригинал (EN) - переводим на displayLang
        try {
          const translation = await translateForUser(userId, content, 'en', displayLang);
          updatedMessage.content = content;
          updatedMessage.translated_content = translation;
          console.log(`[Bidirectional Translation] Assistant message EN->${displayLang}:`, translation.substring(0, 50));
        } catch (translateErr) {
          console.error('[Bidirectional Translation] Translation to displayLang failed:', translateErr);
          updatedMessage.translated_content = message.translated_content;
        }
      }
      if (translated_content !== undefined && translated_content !== message.translated_content && translated_content) {
        // Обновлен перевод (displayLang) - переводим обратно на EN
        try {
          const translation = await translateForUser(userId, translated_content, displayLang, 'en');
          updatedMessage.content = translation;
          updatedMessage.translated_content = translated_content;
          console.log(`[Bidirectional Translation] Assistant message ${displayLang}->EN:`, translation.substring(0, 50));
        } catch (translateErr) {
          console.error('[Bidirectional Translation] Translation to English failed:', translateErr);
          updatedMessage.content = message.content;
        }
      }
    }

    // Сохраняем в БД - передаем только поля для обновления
    const updates: UpdateMessageParams = {
      content: updatedMessage.content,
    };
    // Только если translated_content не null, добавляем его в updates
    if (updatedMessage.translated_content !== null) {
      updates.translated_content = updatedMessage.translated_content;
    }
    const savedMessage = messageService.updateMessage(messageId, userId, updates);

    res.status(200).json(savedMessage);
  } catch (error) {
    console.error('[Bidirectional Translation] Error:', error);
    const error_ = error as Error & { statusCode?: number };
    const statusCode = error_.statusCode || 500;
    res.status(statusCode).json({ error: error_.message });
  }
});

export default router;
