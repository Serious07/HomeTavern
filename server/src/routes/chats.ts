import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { chatService } from '../services/chat.service';
import { messageService } from '../services/message.service';
import { llmService } from '../services/llm.service';
import { translationService } from '../services/translation.service';
import { messageRepository } from '../repositories/message.repository';
import { chatRepository } from '../repositories/chat.repository';
import { Message } from '../types';

const router = Router();

// Все роуты требуют аутентификации
router.use(authenticate);

/**
 * SSE Event types
 */
interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Форматирование SSE сообщения
 */
function formatSSEEvent(eventType: string, data: any): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Отправка SSE события
 */
function sendSSEEvent(res: Response, eventType: string, data: any): void {
  res.write(formatSSEEvent(eventType, data));
}

/**
 * GET /api/chats
 * Получение списка чатов текущего пользователя
 */
router.get('/', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chats = chatService.getAllChats(userId);
    // Логирование updated_at для отладки
    console.log('[ChatsRoute] Loading chats for user', userId, '- chats count:', chats.length);
    chats.forEach(chat => {
      console.log('[ChatsRoute] Chat', chat.id, 'updated_at:', chat.updated_at);
    });
    res.status(200).json(chats);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/chats/:chatId/stream
 * SSE поток для генерации ответа на последнее сообщение пользователя в чате
 * Token передается через query параметр: ?token=<jwt_token>
 * ВАЖНО: Этот роут должен быть ДО /:id чтобы не конфликтовать
 */
router.get('/:chatId/stream', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const chatId = parseInt(req.params.chatId, 10);

  if (isNaN(chatId)) {
    return res.status(400).json({ error: 'Invalid chatId' });
  }

  // Настройка SSE заголовков
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  let fullContent = '';
  let translatedText = '';

  try {
    // 1. Проверяем доступ к чату
    const chat = await chatService.getChatWithMessages(chatId, userId);
    if (!chat) {
      sendSSEEvent(res, 'error', { message: 'Chat not found or access denied' });
      res.end();
      return;
    }

    // 2. Находим последнее сообщение пользователя
    const userMessages = chat.messages.filter((m: any) => m.role === 'user');
    if (userMessages.length === 0) {
      sendSSEEvent(res, 'error', { message: 'No user messages found in chat' });
      res.end();
      return;
    }
    const lastUserMessage = userMessages[userMessages.length - 1];

    // 3. Используем контент сообщения (уже может быть переведен на английский)
    const messageText = lastUserMessage.translated_content || lastUserMessage.content;
    const detectedLang = await translationService.detectLanguage(messageText);
    let messageInEnglish = messageText;

    if (detectedLang === 'ru') {
      sendSSEEvent(res, 'translation', { 
        type: 'user_message_translation',
        from: 'ru',
        to: 'en'
      });
      messageInEnglish = await translationService.translateToEnglish(messageText);
      console.log(`Translated user message: "${messageText}" -> "${messageInEnglish}"`);
    }

    // 4. Генерируем поток ответа от LLM
    const stream = llmService.generateStream(userId, chatId, messageInEnglish);

    // 5. Создаем сообщение ассистента в БД ПЕРЕД потоком (чтобы получить ID)
    const tempMessage = messageRepository.createMessage(
      chatId,
      'assistant',
      '',
      undefined
    );
    const newMessageId = String(tempMessage.id);
    
    // Отправляем ID сообщения сразу
    sendSSEEvent(res, 'message_id', { messageId: newMessageId });

    // 6. Обрабатываем поток
    for await (const chunk of stream) {
      if (chunk.type === 'reasoning_token') {
        sendSSEEvent(res, 'reasoning_token', { token: chunk.token });
      } else if (chunk.type === 'content_token') {
        sendSSEEvent(res, 'content_token', { token: chunk.token });
        fullContent += chunk.token;
      }
    }

    // 7. Переводим ответ на русский (если оригинал на английском)
    const responseLang = await translationService.detectLanguage(fullContent);
    if (responseLang === 'en') {
      sendSSEEvent(res, 'translation', {
        type: 'assistant_message_translation',
        from: 'en',
        to: 'ru'
      });
      translatedText = await translationService.translateToRussian(fullContent);
      console.log(`Translated assistant response: "${fullContent}" -> "${translatedText}"`);
    } else {
      translatedText = fullContent;
    }

    // 8. Обновляем сообщение ассистента в БД с полным контентом и переводом
    messageRepository.updateMessage(tempMessage.id, {
      content: fullContent,
      translated_content: translatedText !== fullContent ? translatedText : undefined
    });

    // 9. Обновляем updated_at чата
    chatRepository.updateChatUpdatedAt(chatId);
    console.log('[ChatsRoute] Updated updated_at for chat', chatId);

    // 10. Отправляем финальное событие
    sendSSEEvent(res, 'done', { 
      messageId: newMessageId,
      translatedText
    });

  } catch (error) {
    console.error('Error in /api/chats/:chatId/stream:', error);
    sendSSEEvent(res, 'error', { 
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    res.end();
  }
});

/**
 * GET /api/chats/:id
 * Получение чата по ID
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.id, 10);

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    const chat = await chatService.getChatWithMessages(chatId, userId);

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    res.status(200).json(chat);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/chats
 * Создание чата
 * Body: { character_id: number, title?: string }
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { character_id, title } = req.body;

    if (!character_id) {
      return res.status(400).json({ error: 'character_id is required' });
    }

    const chat = await chatService.createChat(userId, character_id, title);
    res.status(201).json(chat);
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    const statusCode = error_.statusCode || 400;
    res.status(statusCode).json({ error: error_.message });
  }
});

/**
 * PUT /api/chats/:id
 * Обновление чата
 * Body: { title?: string, character_id?: number }
 */
router.put('/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.id, 10);
    const updates = req.body;

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    const chat = chatService.updateChat(chatId, userId, updates);

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    res.status(200).json(chat);
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    const statusCode = error_.statusCode || 400;
    res.status(statusCode).json({ error: error_.message });
  }
});

/**
 * DELETE /api/chats/:id
 * Удаление чата
 */
router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.id, 10);

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    const deleted = chatService.deleteChat(chatId, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    res.status(200).json({ message: 'Chat deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/chats/generate
 * Генерация ответа от LLM с SSE потоком
 * Body: { chatId: number, message: string }
 */
router.post('/generate', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const { chatId, message } = req.body;

  // Валидация входных данных
  if (!chatId || !message) {
    return res.status(400).json({ error: 'chatId and message are required' });
  }

  const chatIdNum = parseInt(chatId, 10);
  if (isNaN(chatIdNum)) {
    return res.status(400).json({ error: 'Invalid chatId' });
  }

  // Настройка SSE заголовков
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  let messageId: string | null = null;
  let fullContent = '';
  let translatedText = '';

  try {
    // 1. Проверяем доступ к чату
    const chat = await chatService.getChatWithMessages(chatIdNum, userId);
    if (!chat) {
      sendSSEEvent(res, 'error', { message: 'Chat not found or access denied' });
      res.end();
      return;
    }

    // 2. Переводим сообщение пользователя на английский (если на русском)
    const detectedLang = await translationService.detectLanguage(message);
    let messageInEnglish = message;

    if (detectedLang === 'ru') {
      sendSSEEvent(res, 'translation', { 
        type: 'user_message_translation',
        from: 'ru',
        to: 'en'
      });
      messageInEnglish = await translationService.translateToEnglish(message);
      console.log(`Translated user message: "${message}" -> "${messageInEnglish}"`);
    }

    // 3. Сохраняем сообщение пользователя в БД
    const userMessage = messageRepository.createMessage(
      chatIdNum,
      'user',
      message,
      messageInEnglish !== message ? messageInEnglish : undefined
    );

    // 4. Генерируем поток ответа от LLM
    const stream = llmService.generateStream(userId, chatIdNum, messageInEnglish);

    // 5. Обрабатываем поток
    for await (const chunk of stream) {
      if (chunk.type === 'reasoning_token') {
        sendSSEEvent(res, 'reasoning_token', { token: chunk.token });
      } else if (chunk.type === 'content_token') {
        sendSSEEvent(res, 'content_token', { token: chunk.token });
        fullContent += chunk.token;
      }
    }

    // 6. Переводим ответ на русский (если оригинал на английском)
    const responseLang = await translationService.detectLanguage(fullContent);
    if (responseLang === 'en') {
      sendSSEEvent(res, 'translation', {
        type: 'assistant_message_translation',
        from: 'en',
        to: 'ru'
      });
      translatedText = await translationService.translateToRussian(fullContent);
      console.log(`Translated assistant response: "${fullContent}" -> "${translatedText}"`);
    } else {
      translatedText = fullContent;
    }

    // 7. Сохраняем сообщение ассистента в БД
    const assistantMessage = messageRepository.createMessage(
      chatIdNum,
      'assistant',
      fullContent,
      translatedText !== fullContent ? translatedText : undefined
    );
    messageId = String(assistantMessage.id);

    // 8. Обновляем updated_at чата
    chatRepository.updateChatUpdatedAt(chatIdNum);
    console.log('[ChatsRoute] Updated updated_at for chat', chatIdNum);

    // 9. Отправляем финальное событие
    sendSSEEvent(res, 'done', { 
      messageId,
      translatedText
    });

  } catch (error) {
    console.error('Error in /api/chats/generate:', error);
    sendSSEEvent(res, 'error', { 
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    res.end();
  }
});

export default router;
