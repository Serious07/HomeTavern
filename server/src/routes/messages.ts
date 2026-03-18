import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { messageService } from '../services/message.service';
import { chatService } from '../services/chat.service';
import { translationService } from '../services/translation.service';

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

    // Автоматический перевод сообщения пользователя на английский
    let translatedContent = translated_content;
    if (role === 'user' && !translatedContent) {
      try {
        const detectedLang = await translationService.detectLanguage(content);
        if (detectedLang !== 'en') {
          translatedContent = await translationService.translate(content, { sourceLang: detectedLang, targetLang: 'en' }).then(r => r.translatedText);
          console.log(`[Translation] Translated user message from ${detectedLang} to en:`, translatedContent);
        } else {
          translatedContent = content; // Уже на английском
        }
      } catch (translateError) {
        console.error('[Translation] Translation error:', translateError);
        // Если перевод не удался, используем оригинал
        translatedContent = content;
      }
    }

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

export default router;
