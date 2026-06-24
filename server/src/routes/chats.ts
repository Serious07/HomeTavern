import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { chatService } from '../services/chat.service';
import { messageService } from '../services/message.service';
import { llmService, StreamTimingContext } from '../services/llm.service';
import {
  translateForUser,
  detectLanguage,
  getTranslationService,
  translationService,
} from '../services/translation.service';
import { messageRepository } from '../repositories/message.repository';
import { chatRepository } from '../repositories/chat.repository';
import { Message } from '../types';
import { stripThoughtTags } from '../utils/text';
import db from '../config/database';

// (removed - now using getTranslationService(userId).settings.enabled)

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
   let startTime = 0;
   let contentTokenCount = 0;
   let reasoningTokenCount = 0;

   // Контекст для отслеживания времени первого токена.
   // firstTokenTime устанавливается при получении первого токена от LLM,
   // что исключает время предпроцессинга из расчёта скорости генерации.
   const timingContext: StreamTimingContext = { firstTokenTime: 0 };

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
    console.log('[ChatsRoute] Last user message content:', lastUserMessage.content);
    console.log('[ChatsRoute] Last user message translated_content:', lastUserMessage.translated_content);
    
    // 2.6: Per-user translation settings
    const { settings: userSettings } = getTranslationService(userId);
    const translationEnabled = userSettings.enabled;

    let messageText: string;
    let messageInEnglish: string;

    if (translationEnabled) {
      messageText = lastUserMessage.translated_content || lastUserMessage.content;
      console.log('[ChatsRoute] Using message text (with translation):', messageText);
      const detectedLang = await detectLanguage(messageText);
      console.log('[ChatsRoute] Detected language:', detectedLang);
      messageInEnglish = messageText;

      if (detectedLang !== 'en') {
        sendSSEEvent(res, 'translation', {
          type: 'user_message_translation',
          from: detectedLang,
          to: 'en'
        });
        messageInEnglish = await translateForUser(userId, messageText, detectedLang, 'en');
        console.log(`Translated user message: "${messageText}" -> "${messageInEnglish}"`);
      } else {
        console.log('[ChatsRoute] Message is already in English, no translation needed');
      }
    } else {
      messageText = lastUserMessage.content;
      messageInEnglish = messageText;
      console.log('[ChatsRoute] Translation disabled, using original content for LLM:', messageText);
    }

    // 4. Создаём AbortController для возможности отмены генерации
     const abortController = new AbortController();
     
     // Сохраняю AbortController в LLMService для возможности отмены
     llmService.setAbortController(chatId, abortController);
     
     // 4.5. Фильтруем последнее сообщение пользователя из истории, чтобы избежать дублирования
     // т.к. currentMessage (messageInEnglish) будет добавлен отдельно в formatMessagesForQwen
     const allUserMessages = chat.messages.filter((m: any) => m.role === 'user');
     let filteredHistory: any[] = chat.messages;
     if (allUserMessages.length > 0) {
       const lastUserMsgId = allUserMessages[allUserMessages.length - 1].id;
       filteredHistory = chat.messages.filter((m: any) => m.id !== lastUserMsgId);
       console.log(`[ChatsRoute] Filtered out last user message (id=${lastUserMsgId}) from history to prevent duplication`);
     }
     
     // 5. Генерируем поток ответа от LLM с отфильтрованной историей (timingContext передаётся для точного измерения скорости)
     console.log('[ChatsRoute] Sending to LLM:', messageInEnglish);
     const stream = llmService.generateStream(userId, chatId, messageInEnglish, abortController.signal, timingContext, filteredHistory);

    // 5. Создаем сообщение ассистента в БДО НЕ перед потоком (чтобы получить ID)
     const createdAt = new Date().toISOString();  // Сохраняем время создания в UTC ISO 8601
     startTime = Date.now();  // Для fallback если timingContext не сработал
    const tempMessage = messageRepository.createMessage(
      chatId,
      'assistant',
      '',
      undefined,
      undefined,
      createdAt
    );
    const newMessageId = String(tempMessage.id);
    
    // Отправляем ID сообщения сразу
    sendSSEEvent(res, 'message_id', { messageId: newMessageId });

    // 6. Обрабатываем поток
    for await (const chunk of stream) {
      if (chunk.type === 'reasoning_token') {
        reasoningTokenCount++;
        sendSSEEvent(res, 'reasoning_token', { token: chunk.token });
      } else if (chunk.type === 'content_token') {
        sendSSEEvent(res, 'content_token', { token: chunk.token });
        fullContent += chunk.token;
        contentTokenCount++;
      }
    }

    // 7. Вычисляем метрики генерации
     // ВАЖНО: используем timingContext.firstTokenTime вместо startTime,
     // чтобы исключить время предпроцессинга из расчёта скорости.
     const endTime = Date.now();
     const firstTokenTimestamp = timingContext.firstTokenTime > 0 ? timingContext.firstTokenTime : startTime;
     const durationSecs = firstTokenTimestamp > 0 ? (endTime - firstTokenTimestamp) / 1000 : 0;
    
    // Рассчитываем общую скорость (content + reasoning)
    const totalTokenCount = contentTokenCount + reasoningTokenCount;
    const tokensPerSec = durationSecs > 0 ? totalTokenCount / durationSecs : 0;
    console.log(`[ChatsRoute] Generation stats: ${contentTokenCount} content + ${reasoningTokenCount} reasoning = ${totalTokenCount} tokens, ${durationSecs.toFixed(2)}s, ${tokensPerSec.toFixed(2)} tokens/sec`);

    // 7.5. Удаляем теги <thought> и их содержимое из ответа
    fullContent = stripThoughtTags(fullContent);

    // 2.7: Переводим ответ на displayLang (если оригинал на английском и перевод включен)
    if (translationEnabled) {
      const responseLang = await detectLanguage(fullContent);
      if (responseLang !== userSettings.displayLang) {
        sendSSEEvent(res, 'translation', {
          type: 'assistant_message_translation',
          from: responseLang,
          to: userSettings.displayLang
        });
        translatedText = await translateForUser(userId, fullContent, responseLang, userSettings.displayLang);
        console.log(`Translated assistant response: "${fullContent}" -> "${translatedText}"`);
      } else {
        translatedText = fullContent;
      }
    } else {
      translatedText = fullContent;
      console.log('[ChatsRoute] Translation disabled, assistant response saved as-is');
    }

    // 9. Обновляем сообщение ассистента в БД с полным контентом, переводом и метриками
    messageRepository.updateMessage(tempMessage.id, {
      content: fullContent,
      translated_content: translationEnabled && translatedText !== fullContent ? translatedText : undefined,
      generated_at: new Date().toISOString(),
      tokens_per_sec: tokensPerSec,
      total_tokens: totalTokenCount,
      reasoning_tokens: reasoningTokenCount
    });

    // 10. Обновляем updated_at чата
    chatRepository.updateChatUpdatedAt(chatId);
    console.log('[ChatsRoute] Updated updated_at for chat', chatId);

    // 11. Отправляем финальное событие
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
    // Очищаем AbortController
    llmService.setAbortController(chatId, null);
    res.end();
  }
});

/**
 * POST /api/chats/:chatId/cancel
 * Отмена генерации для чата - прерывает генерацию на стороне LLM
 */
router.post('/:chatId/cancel', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.chatId, 10);

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chatId' });
    }

    // Проверяем доступ к чату
    const chat = chatRepository.getChatById(chatId);
    if (!chat || chat.user_id !== userId) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    // Отменяем генерацию на стороне LLM
    const cancelled = llmService.cancelGeneration(chatId);

    res.status(200).json({ 
      cancelled,
      message: cancelled ? 'Generation cancelled' : 'No active generation to cancel' 
    });
  } catch (error) {
    console.error('Error in POST /api/chats/:chatId/cancel:', error);
    res.status(500).json({ error: 'Internal server error' });
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
 * Body: { character_id: number, title?: string, greeting_index?: number }
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { character_id, title, greeting_index } = req.body;

    if (!character_id) {
      return res.status(400).json({ error: 'character_id is required' });
    }

    const chat = await chatService.createChat(userId, character_id, title, greeting_index);
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
  let genStartTime = 0;
  let genContentTokenCount = 0;
  let genReasoningTokenCount = 0;

  try {
    // 1. Проверяем доступ к чату
    const chat = await chatService.getChatWithMessages(chatIdNum, userId);
    if (!chat) {
      sendSSEEvent(res, 'error', { message: 'Chat not found or access denied' });
      res.end();
      return;
    }

    // 2. Переводим сообщение пользователя на английский (если на русском и перевод включен)
    console.log('[ChatsRoute] Original message:', message);
    
    // 2.6: Per-user translation settings (generate endpoint)
    const { settings: genUserSettings } = getTranslationService(userId);
    const translationEnabled = genUserSettings.enabled;

    let messageInEnglish: string;
    let detectedLang: string;

    if (translationEnabled) {
      detectedLang = await detectLanguage(message);
      console.log('[ChatsRoute] Detected language:', detectedLang);
      messageInEnglish = message;

      if (detectedLang !== 'en') {
        sendSSEEvent(res, 'translation', {
          type: 'user_message_translation',
          from: detectedLang,
          to: 'en'
        });
        messageInEnglish = await translateForUser(userId, message, detectedLang, 'en');
        console.log(`Translated user message: "${message}" -> "${messageInEnglish}"`);
      } else {
        console.log('[ChatsRoute] Message is already in English, no translation needed');
      }
    } else {
      messageInEnglish = message;
      detectedLang = await detectLanguage(message);
      console.log('[ChatsRoute] Translation disabled, using original content for LLM:', message);
    }

    // 3. Сохраняем сообщение пользователя в БД
    const shouldSaveTranslation = translationEnabled && messageInEnglish !== message && messageInEnglish.trim() !== '';
    console.log('[ChatsRoute] Should save translation:', shouldSaveTranslation, '- messageInEnglish:', messageInEnglish);
    const createdAt = new Date().toISOString();  // Сохраняем время создания в UTC ISO 8601
    const userMessage = messageRepository.createMessage(
      chatIdNum,
      'user',
      message,
      shouldSaveTranslation ? messageInEnglish : undefined,
      undefined,
      createdAt
    );
    const savedUserMessageId = userMessage.id;

    // 3.5. Перезагружаем историю из БД после сохранения пользовательского сообщения
    // и фильтруем последнее user сообщение чтобы избежать дублирования
    // т.к. currentMessage (messageInEnglish) будет добавлен отдельно в formatMessagesForQwen
    const refreshedChat = chatRepository.getChatWithMessages(chatIdNum);
    let filteredHistory: any[] = refreshedChat?.messages || [];
    if (refreshedChat && refreshedChat.messages.length > 0) {
      const allUserMsgs = refreshedChat.messages.filter((m: any) => m.role === 'user');
      if (allUserMsgs.length > 0) {
        const lastUserMsgId = allUserMsgs[allUserMsgs.length - 1].id;
        filteredHistory = refreshedChat.messages.filter((m: any) => m.id !== lastUserMsgId);
        console.log(`[ChatsRoute /generate] Filtered out last user message (id=${lastUserMsgId}) from history to prevent duplication`);
      }
    }

    // 4. Создаём контекст для отслеживания времени первого токена
     const genTimingContext: StreamTimingContext = { firstTokenTime: 0 };
     
     // 5. Генерируем поток ответа от LLM с отфильтрованной историей (timingContext передаётся для точного измерения скорости)
     const stream = llmService.generateStream(userId, chatIdNum, messageInEnglish, undefined, genTimingContext, filteredHistory);

    // 6. Обрабатываем поток
    for await (const chunk of stream) {
      if (chunk.type === 'reasoning_token') {
        genReasoningTokenCount++;
        sendSSEEvent(res, 'reasoning_token', { token: chunk.token });
      } else if (chunk.type === 'content_token') {
        sendSSEEvent(res, 'content_token', { token: chunk.token });
        fullContent += chunk.token;
        genContentTokenCount++;
      }
    }

    // 7. Вычисляем метрики генерации
     // ВАЖНО: используем genTimingContext.firstTokenTime вместо genStartTime,
     // чтобы исключить время предпроцессинга из расчёта скорости.
     const genEndTime = Date.now();
     const genFirstTokenTimestamp = genTimingContext.firstTokenTime > 0 ? genTimingContext.firstTokenTime : genStartTime;
     const genDurationSecs = genFirstTokenTimestamp > 0 ? (genEndTime - genFirstTokenTimestamp) / 1000 : 0;
    
    // Рассчитываем общую скорость (content + reasoning)
    const genTotalTokenCount = genContentTokenCount + genReasoningTokenCount;
    const genTokensPerSec = genDurationSecs > 0 ? genTotalTokenCount / genDurationSecs : 0;
    console.log(`[ChatsRoute] Generation stats: ${genContentTokenCount} content + ${genReasoningTokenCount} reasoning = ${genTotalTokenCount} tokens, ${genDurationSecs.toFixed(2)}s, ${genTokensPerSec.toFixed(2)} tokens/sec`);

    // 7.5. Удаляем теги <thought> и их содержимое из ответа
    fullContent = stripThoughtTags(fullContent);

    // 2.7: Переводим ответ на displayLang (если оригинал на английском и перевод включен)
    if (translationEnabled) {
      const responseLang = await detectLanguage(fullContent);
      if (responseLang !== genUserSettings.displayLang) {
        sendSSEEvent(res, 'translation', {
          type: 'assistant_message_translation',
          from: responseLang,
          to: genUserSettings.displayLang
        });
        translatedText = await translateForUser(userId, fullContent, responseLang, genUserSettings.displayLang);
        console.log(`Translated assistant response: "${fullContent}" -> "${translatedText}"`);
      } else {
        translatedText = fullContent;
      }
    } else {
      translatedText = fullContent;
      console.log('[ChatsRoute] Translation disabled, assistant response saved as-is');
    }

    // 9. Сохраняем сообщение ассистента в БД с метриками
    const assistantMessageCreatedAt = new Date().toISOString();  // Время создания в UTC ISO 8601
    const assistantMessage = messageRepository.createMessage(
      chatIdNum,
      'assistant',
      fullContent,
      translationEnabled && translatedText !== fullContent ? translatedText : undefined,
      undefined,
      assistantMessageCreatedAt
    );
    messageId = String(assistantMessage.id);
    
    // Обновляем сообщение с метриками
    messageRepository.updateMessage(assistantMessage.id, {
      generated_at: new Date().toISOString(),
      tokens_per_sec: genTokensPerSec,
      total_tokens: genTotalTokenCount,
      reasoning_tokens: genReasoningTokenCount
    });

    // 10. Обновляем updated_at чата
    chatRepository.updateChatUpdatedAt(chatIdNum);
    console.log('[ChatsRoute] Updated updated_at for chat', chatIdNum);

    // 11. Отправляем финальное событие
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
