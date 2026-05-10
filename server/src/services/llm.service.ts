/**
 * LLM Service - Integration with llm-client library
 * Provides streaming generation with reasoning and content separation
 */

import { characterRepository } from '../repositories/character.repository';
import { chatRepository, Message } from '../repositories/chat.repository';
import { userRepository } from '../repositories/user.repository';
import { heroVariationRepository } from '../repositories/hero.variation.repository';
import { contextRepository } from '../repositories/context.repository';
import { chatBlockRepository, ChatBlock } from '../repositories/chat-block.repository';
import { compressionService } from './compression.service';
import { systemPromptService } from './system-prompt.service';
import { llmConnectionRepository } from '../repositories/llm-connection.repository';

// Типы для LLM
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface StreamChunk {
  type: 'reasoning_token' | 'content_token';
  token: string;
}

export interface GenerationStats {
  startTime: number;
  endTime: number;
  durationSecs: number;
  contentTokenCount: number;
  tokensPerSec: number;
}

// Типы для usage из LLM ответа
export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface StreamChunkWithUsage extends StreamChunk {
  usage?: Usage;
}

export interface ChatContext {
  chat: any;
  character: any;
  heroProfile: string | null;
  heroName: string | null;
  historyMessages: any[];
}

/**
 * Заменяет плейсхолдеры {{user}}, {user}, {{USER}}, {USER} и т.д. на имя героя
 */
export function replaceUserPlaceholders(text: string, heroName: string | null): string {
  if (!heroName) {
    return text;
  }
  
  // Заменяем различные варианты плейсхолдеров (регистронезависимо)
  const placeholders = [
    /\{\{user\}\}/gi,
    /\{user\}/gi,
    /\{\{USER\}\}/gi,
    /\{USER\}/gi,
    /\{\{User\}\}/gi,
    /\{User\}/gi,
  ];
  
  let result = text;
  for (const placeholder of placeholders) {
    result = result.replace(placeholder, heroName);
  }
  
  return result;
}

/**
 * Инструкция для LLM о форматировании текста с тегами.
 * ДОБАВЛЯЕТСЯ в конец системного промпта.
 * 
 * Используется для автоматического распознавания типов речи на клиенте
 * и стилизации их в MarkdownRenderer.
 * 
 * Теги НЕ видны при отображении — клиент преобразует их в стилизованные span.
 */
export const LLM_FORMATTING_INSTRUCTION = `
# Форматирование текста (ОБЯЗАТЕЛЬНО)

Используй специальные теги для маркирования типов речи. Клиент автоматически
преобразует их в стилизованный текст. Теги НЕ видны при отображении.

## Теги:

### <speech>...</speech> — прямая речь персонажей
Оранжевый жирный текст. ОБЕРТАЙ В ЭТОТ ТЕГ ТОЛЬКО слова, которые произносит персонаж.
Каждая реплика — отдельный <speech>...</speech> тег.

### <monologue>...</monologue> — монолог или внутренние мысли
Оранжевый курсив. Используй для мыслей персонажа или длинных монологов.

### <narration>...</narration> — описание действий и окружения
Обычный текст (теги просто удаляются).

## ГЛАВНОЕ ПРАВИЛО:

В speech — ТОЛЬКО слова персонажа. Всё остальное — narration.

### Критически важно:

Если после начала речи идёт НЕ речь (описание, пояснение, реакция) — СРАЗУ закрывай speech и продолжай в narration:

❌ Неправильно (описание в speech):
<speech>— Сынок, — голос звучит резко, без тени ожидания благодарности. — Мне завтра к обеду нужен новый крем для лица. Снимешь с карты, которая под подушкой, и купишь. Не забудь.</speech>

✅ Правильно (разделяем речь и описание):
<speech>— Сынок,</speech> <narration>голос звучит резко, без тени ожидания благодарности.</narration> <speech>— Мне завтра к обеду нужен новый крем для лица. Снимешь с карты, которая под подушкой, и купишь. Не забудь.</speech>

❌ Неправильно (действие в speech):
<speech>— Ты там всё ещё возишься? Кружку поставь на место, а то тараканы разгуляются. И не забудь выключить свет, когда пойдёшь спать.</speech> <narration>Она уходит в свой угол.</narration>

✅ Правильно (каждое предложение речи в своём теге):
<speech>— Ты там всё ещё возишься?</speech> <speech>Кружку поставь на место, а то тараканы разгуляются.</speech> <speech>И не забудь выключить свет, когда пойдёшь спать.</speech> <narration>Она уходит в свой угол.</narration>

### Простое правило:

1. Вижу слова персонажа → <speech>...</speech>
2. Вижу описание/действие/пояснение → <narration>...</narration>
3. Снова слова → новый <speech>...</speech>

### Разбор примеров:

✅ Пример 1 (короткий диалог):
<narration>Дмитрий наклоняется вперед.</narration> <speech>— Еще одна игра?</speech> <narration>Он переспрашивает.</narration> <speech>— Но мы только-только вышли в мобильные!</speech>

✅ Пример 2 (разделённая речь):
<speech>— Ты там ещё долго?</speech> <narration>Голос звучит без вопроса, скорее как констатация факта.</narration> <narration>Она ставит корзинку на стол.</narration> <speech>— После мытья протри плиту.</speech> <narration>Она говорит, не поворачиваясь.</narration>

✅ Пример 3 (семейная сцена):
<narration>Вода в раковине ледяная.</narration> <speech>— Галина,</speech> <narration>зовёт из комнаты Людмила.</narration> <speech>— Ты что, опять забыла про стирку?</speech> <narration>Снаружи взвизгивают сирены.</narration> <speech>— Да я всё сделаю,</speech> <narration>отвечает бабушка.</narration>

✅ Пример 4 (сложная сцена):
<narration>Бабушка поднимается из-за стола.</narration> <speech>— Ты там всё ещё возишься?</speech> <speech>Кружку поставь на место, а то тараканы разгуляются.</speech> <narration>Она уходит в свой угол и начинает наводить порядок.</narration> <narration>Мать Галина высматривается из коридора.</narration> <speech>— Сынок,</speech> <narration>голос звучит резко, без тени ожидания благодарности.</narration> <speech>— Мне завтра к обеду нужен новый крем для лица. Снимешь с карты, которая под подушкой, и купишь. Не забудь.</speech> <narration>Она захлопывает дверь, не дожидаясь ответа.</narration>

❌ Пример 5 (речь без тегов):
— Ты там всё ещё возишься? Кружку поставь на место. Она уходит в свой угол.

❌ Пример 6 (слишком длинный тег с несколькими репликами):
<speech>— Привет! — сказал он. — Как дела? — спросила она.</speech>

## Важно:
- В <speech>...</speech> только СЛОВА персонажа, которые он произносит
- После речи — всегда <narration> для пояснений, действий, реакций
- НЕ включай в speech пояснения КАК сказано
- НЕ включай в speech описания тона, реакции, молчания
- Каждая новая реплика — НОВЫЙ <speech>...</speech> тег
- Клиент автоматически преобразует теги в стилизованный текст
- Теги НЕ отображаются пользователю
`;

/**
 * Форматирование истории сообщений для Qwen 3.5
 * Системный промпт в САМОМ НАЧАЛЕ, затем профиль героя, история, текущее сообщение
 */
export function formatMessagesForQwen(
  userId: number,
  character: any,
  heroProfile: string | null,
  heroName: string | null,
  historyMessages: any[],
  currentMessage: string
): LLMMessage[] {
  const messages: LLMMessage[] = [];

  // 1. Получаем активный системный промпт пользователя
  const systemParts: string[] = [];
  
  const activePrompt = systemPromptService.getActiveSystemPrompt(userId);
  if (activePrompt?.prompt_text) {
    const processedSystemPrompt = replaceUserPlaceholders(activePrompt.prompt_text, heroName);
    systemParts.push(processedSystemPrompt);
  }

  // Добавляем инструкцию по форматированию текста
  systemParts.push(LLM_FORMATTING_INSTRUCTION.trim());

  // 2. Описание персонажа (Character profile)
  const characterProfileParts: string[] = [];
  characterProfileParts.push(`Name: ${character.name}`);
  if (character.description) {
    characterProfileParts.push(`Description: ${character.description}`);
  }
  if (character.personality) {
    characterProfileParts.push(`Personality: ${character.personality}`);
  }
  if (characterProfileParts.length > 0) {
    systemParts.push(`Character:\n${characterProfileParts.join('\n')}`);
  }

  // 3. Профиль героя (Hero profile)
  if (heroProfile) {
    systemParts.push(`Hero Profile:\n${heroProfile}`);
  }

  // Добавляем одно системное сообщение только если есть что-то
  if (systemParts.length > 0) {
    messages.push({
      role: 'system',
      content: systemParts.join('\n\n')
    });
  }

  // 2. История сообщений (с учётом hidden)
  for (const msg of historyMessages) {
    if (msg.hidden) continue; // Пропускаем скрытые сообщения

    const role = msg.role === 'user' ? 'user' : 'assistant';
    
    // Для LLM всегда используем английский текст:
    // - user сообщения: translated_content (перевод с русского на английский)
    // - assistant сообщения: content (оригинал на английском)
    const contentForLLM = msg.role === 'user'
      ? (msg.translated_content || msg.content)  // Если есть перевод, используем его
      : msg.content;  // Для assistant используем оригинал (уже на английском)
    
    messages.push({
      role,
      content: contentForLLM
    });
  }

  // 3. Текущее сообщение пользователя (также заменяем плейсхолдеры)
  const processedCurrentMessage = replaceUserPlaceholders(currentMessage, heroName);
  messages.push({
    role: 'user',
    content: processedCurrentMessage
  });

  return messages;
}

/**
 * Внутренняя функция форматирования с поддержкой сжатых блоков
 */
function formatMessagesForQwenInternal(
  userId: number,
  character: any,
  heroProfile: string | null,
  heroName: string | null,
  historyMessages: Message[],
  currentMessage: string,
  compressedBlocks: ChatBlock[] | null  // Сжатые блоки (null = без сжатия)
): LLMMessage[] {
  const messages: LLMMessage[] = [];

  // 1. Получаем активный системный промпт пользователя
  const systemParts: string[] = [];
  
  const activePrompt = systemPromptService.getActiveSystemPrompt(userId);
  if (activePrompt?.prompt_text) {
    const processedSystemPrompt = replaceUserPlaceholders(activePrompt.prompt_text, heroName);
    systemParts.push(processedSystemPrompt);
  }

  // Добавляем инструкцию по форматированию текста
  systemParts.push(LLM_FORMATTING_INSTRUCTION.trim());

  // 2. Описание персонажа (Character profile)
  const characterProfileParts: string[] = [];
  characterProfileParts.push(`Name: ${character.name}`);
  if (character.description) {
    characterProfileParts.push(`Description: ${character.description}`);
  }
  if (character.personality) {
    characterProfileParts.push(`Personality: ${character.personality}`);
  }
  if (characterProfileParts.length > 0) {
    systemParts.push(`Character:\n${characterProfileParts.join('\n')}`);
  }

  // 3. Профиль героя (Hero profile)
  if (heroProfile) {
    systemParts.push(`Hero Profile:\n${heroProfile}`);
  }

  // Добавляем одно системное сообщение только если есть что-то
  if (systemParts.length > 0) {
    messages.push({
      role: 'system',
      content: systemParts.join('\n\n')
    });
  }

  // Создаем маппинг message_id -> block для быстрого поиска
  const messageToBlock = new Map<number, ChatBlock>();
  if (compressedBlocks) {
    for (const block of compressedBlocks) {
      const messageIds = JSON.parse(block.original_message_ids || '[]') as number[];
      messageIds.forEach(msgId => {
        messageToBlock.set(msgId, block);
      });
    }
  }

  // 4. История сообщений (с учётом hidden и сжатых блоков)
  for (const msg of historyMessages) {
    if (msg.hidden) continue; // Пропускаем скрытые сообщения

    // Проверяем, входит ли сообщение в сжатый блок
    const block = messageToBlock.get(msg.id);

    if (block && block.is_compressed === 1) {
      // Если это первое сообщение блока (start_message_id), добавляем summary
      // Используем role: 'user' вместо 'system', т.к. system сообщение должно быть первым
      if (msg.id === block.start_message_id) {
        messages.push({
          role: 'user',
          content: `[Сжатая история: ${block.title}]\n${block.summary}`
        });
      }
      // Пропускаем остальные сообщения блока (они уже в summary)
      continue;
    }

    // Если сообщение не в блоке или сжатие отключено, добавляем как обычно
    const role = msg.role === 'user' ? 'user' : 'assistant';
    
    // Для LLM всегда используем английский текст:
    // - user сообщения: translated_content (перевод с русского на английский)
    // - assistant сообщения: content (оригинал на английском)
    const contentForLLM = msg.role === 'user'
      ? (msg.translated_content || msg.content)  // Если есть перевод, используем его
      : msg.content;  // Для assistant используем оригинал (уже на английском)
    
    messages.push({
      role,
      content: contentForLLM
    });
  }

  // 5. Текущее сообщение пользователя (также заменяем плейсхолдеры)
  const processedCurrentMessage = replaceUserPlaceholders(currentMessage, heroName);
  messages.push({
    role: 'user',
    content: processedCurrentMessage
  });

  return messages;
}

/**
 * Форматирование истории с учётом сжатых блоков
 * ВАЖНО: summary добавляется ОДИН РАЗ для каждого блока
 */
export function formatMessagesForQwenWithCompression(
  userId: number,
  character: any,
  heroProfile: string | null,
  heroName: string | null,
  historyMessages: Message[],
  currentMessage: string,
  compressedBlocks: ChatBlock[]
): LLMMessage[] {
  return formatMessagesForQwenInternal(
    userId,
    character,
    heroProfile,
    heroName,
    historyMessages,
    currentMessage,
    compressedBlocks
  );
}

export class LLMService {
  private baseURL: string;
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private client: any; // LLMClient instance
  private activeAbortControllers: Map<number, AbortController> = new Map();
  private currentConnectionId: number | null = null;

  constructor() {
    // Load from database first, fallback to .env
    this.baseURL = process.env.LLM_BASE_URL || 'http://localhost:1234/v1';
    this.apiKey = process.env.LLM_API_KEY || 'local-model-key';
    this.model = process.env.LLM_MODEL || 'qwen-3.5';
    this.maxTokens = parseInt(process.env.LLM_MAX_TOKENS || '') || 64000;

    // Debug logging
    console.log('[LLMService] LLM_BASE_URL:', this.baseURL);
    console.log('[LLMService] LLM_MODEL:', this.model);
    console.log('[LLMService] LLM_API_KEY:', this.apiKey ? '***SET***' : 'NOT SET');

    // Try to initialize LLMClient
    this._initLLMClient();
  }

  /**
   * Initialize/reinitialize the LLMClient with current connection settings
   */
  private _initLLMClient(): void {
    try {
      const { LLMClient } = require('llm-client');
      this.client = new LLMClient({
         baseURL: this.baseURL,
         apiKey: this.apiKey,
         timeout: 900000,
       });
      console.log('[LLMService] LLMClient initialized successfully');
    } catch (error) {
      console.warn('llm-client not installed. Using fallback implementation.');
      console.warn('[LLMService] Error:', error);
      this.client = null;
    }
  }

  /**
   * Switch to a database connection by ID
   * Returns the connection details or null if not found
   */
  switchToConnection(userId: number, connectionId: number): Promise<{
    success: boolean;
    connection?: any;
    error?: string;
  }> {
    try {
      const conn = llmConnectionRepository.getByIdWithDecryptedKey(connectionId);
      if (!conn || conn.user_id !== userId) {
        return Promise.resolve({ success: false, error: 'Connection not found' });
      }

      this.currentConnectionId = connectionId;
      this.baseURL = conn.base_url;
      this.apiKey = conn.api_key_decrypted;
      this.model = conn.model;
      this.maxTokens = conn.max_tokens;

      // Reinitialize client with new settings
      this._initLLMClient();

      console.log('[LLMService] Switched to connection:', conn.name);
      console.log('[LLMService] New BASE_URL:', this.baseURL);
      console.log('[LLMService] New MODEL:', this.model);

      return Promise.resolve({
        success: true,
        connection: {
          id: conn.id,
          name: conn.name,
          base_url: conn.base_url,
          model: conn.model,
        }
      });
    } catch (error) {
      console.error('[LLMService] Error switching connection:', error);
      return Promise.resolve({ success: false, error: 'Internal error' });
    }
  }

  /**
   * Get the currently active connection for a user
   */
  getActiveConnection(userId: number): any {
    const conn = llmConnectionRepository.getActiveByUserId(userId);
    if (!conn) return null;

    const decrypted = llmConnectionRepository.getByIdWithDecryptedKey(conn.id);
    return decrypted;
  }

  /**
   * Get current connection info (without API key)
   */
  getConnectionInfo() {
    return {
      baseURL: this.baseURL,
      model: this.model,
      maxTokens: this.maxTokens,
      connectionId: this.currentConnectionId,
    };
  }

  /**
    * Получение AbortController для чата (для отмены)
    */
   getAbortController(chatId: number): AbortController | null {
     return this.activeAbortControllers.get(chatId) || null;
   }

  /**
    * Установка AbortController для чата
    */
   setAbortController(chatId: number, controller: AbortController | null): void {
     if (controller) {
       this.activeAbortControllers.set(chatId, controller);
     } else {
       this.activeAbortControllers.delete(chatId);
     }
   }

  /**
    * Отмена генерации для чата
    */
   cancelGeneration(chatId: number): boolean {
     const controller = this.activeAbortControllers.get(chatId);
     if (controller) {
       controller.abort();
       this.activeAbortControllers.delete(chatId);
       console.log(`[LLMService] Generation cancelled for chat ${chatId}`);
       return true;
     }
     console.log(`[LLMService] No active generation to cancel for chat ${chatId}`);
     return false;
   }

  /**
    * Получение контекста чата для генерации
    */
   async getChatContext(userId: number, chatId: number): Promise<ChatContext | null> {
    try {
      const chat = chatRepository.getChatById(chatId);
      if (!chat || chat.user_id !== userId) {
        return null;
      }

      const character = characterRepository.getCharacterById(chat.character_id);
      if (!character) {
        return null;
      }

      // Получаем профиль героя пользователя
      const heroProfile = heroVariationRepository.getHeroProfileForLLM(userId);
      
      // Получаем имя героя для подстановки в промпты
      const activeHero = heroVariationRepository.getActiveHeroVariationByUserId(userId);
      const heroName = activeHero?.name || null;

      // Получаем историю сообщений
      const historyMessages = chatRepository.getChatWithMessages(chatId)?.messages || [];

      return {
        chat,
        character,
        heroProfile,
        heroName,
        historyMessages,
      };
    } catch (error) {
      console.error('Error getting chat context:', error);
      return null;
    }
  }

  /**
    * Генерация потока ответа от LLM
    * @param userId - ID пользователя
    * @param chatId - ID чата
    * @param userMessage - Сообщение пользователя
    * @param abortSignal - Signal для отмены генерации
    * @returns Асинхронный итератор с чанками (reasoning_token и content_token)
    */
   async *generateStream(
     userId: number,
     chatId: number,
     userMessage: string,
     abortSignal?: AbortSignal
   ): AsyncGenerator<StreamChunk> {
    const timeoutMs = 900000; // 15 минут таймаут
    const startTime = Date.now();
    let contentTokenCount = 0;
    let reasoningTokenCount = 0;
    let lastUsage: Usage | undefined;

    try {
      // Получаем контекст чата
      const context = await this.getChatContext(userId, chatId);
      if (!context) {
        throw new Error('Chat context not found');
      }

      const { character, heroProfile, heroName, historyMessages } = context;

      // Debug: логирование текущего сообщения перед отправкой в LLM
      console.log('[LLMService] Current user message to LLM:', userMessage.substring(0, 100));
      console.log('[LLMService] Hero name:', heroName);
      console.log('[LLMService] Hero profile:', heroProfile);

      // Получаем сжатые блоки для чата
      const compressedBlocks = chatBlockRepository.getBlocksByChatId(chatId);
      
      // Формируем историю сообщений для Qwen 3.5 с учётом сжатых блоков
      const messages = compressedBlocks.length > 0
        ? formatMessagesForQwenWithCompression(
            userId,
            character,
            heroProfile,
            heroName,
            historyMessages,
            userMessage,
            compressedBlocks
          )
        : formatMessagesForQwen(
            userId,
            character,
            heroProfile,
            heroName,
            historyMessages,
            userMessage
          );

      // Debug: логирование сформированной истории
      console.log('[LLMService] Messages to LLM:', JSON.stringify(messages, null, 2).substring(0, 500));

      // Проверяем наличие клиента
      if (!this.client) {
        // Fallback: эмуляция потока
        console.log('LLM Service: Using fallback stream generation');
        yield* this.generateFallbackStream(userMessage);
        return;
      }

      // Отправляем запрос к LLM с stream: true
      // Передаем abortSignal если есть (для отмены генерации)
      const stream = await this.client.chatCompletionsCreate({
        model: this.model,
        messages: messages,
        stream: true,
        temperature: 0.7,
        max_tokens: parseInt(process.env.LLM_MAX_TOKENS || '') || 64000, // Установлено для совместимости с OpenRouter (max 131072 контекст)
      }, { signal: abortSignal });

      // Обрабатываем поток
      for await (const chunk of stream) {
        // Проверяем наличие usage в чанке (приходит в последнем чанке)
        if (chunk.usage) {
          lastUsage = chunk.usage;
          console.log('[LLMService] Usage from stream:', lastUsage);
        }

        const delta = chunk.choices[0]?.delta || {};
        const content = delta.content || '';
        const reasoningContent = delta.reasoning_content || '';

        // Отправляем reasoning_token если есть reasoning_content
        if (reasoningContent) {
          reasoningTokenCount++;
          yield {
            type: 'reasoning_token',
            token: reasoningContent
          };
        }

        // Отправляем content_token если есть content
        if (content) {
          contentTokenCount++;
          yield {
            type: 'content_token',
            token: content
          };
        }
      }

       // Удаляем AbortController после завершения генерации
       this.activeAbortControllers.delete(chatId);

       // Сохраняем информацию о токенах в БД после завершения генерации
       if (lastUsage) {
         const totalTokens = lastUsage.total_tokens;
         console.log(`[LLMService] Saving token usage for chat ${chatId}: ${totalTokens} total tokens`);
         contextRepository.updateCachedStats(chatId, totalTokens, new Date().toISOString());
       }

       // Логирование метрик генерации с учетом reasoning
      const endTime = Date.now();
      const durationSecs = (endTime - startTime) / 1000;
      
      // Рассчитываем скорость для content токенов
      const contentTokensPerSec = durationSecs > 0 ? contentTokenCount / durationSecs : 0;
      
      // Рассчитываем общую скорость (content + reasoning)
      const totalTokenCount = contentTokenCount + reasoningTokenCount;
      const totalTokensPerSec = durationSecs > 0 ? totalTokenCount / durationSecs : 0;
      
      console.log(`[LLMService] Generation stats:`);
      console.log(`  Content tokens: ${contentTokenCount}`);
      console.log(`  Reasoning tokens: ${reasoningTokenCount}`);
      console.log(`  Total tokens: ${totalTokenCount}`);
      console.log(`  Duration: ${durationSecs.toFixed(2)}s`);
      console.log(`  Content tokens/sec: ${contentTokensPerSec.toFixed(2)}`);
      console.log(`  Total tokens/sec: ${totalTokensPerSec.toFixed(2)}`);
     } catch (error) {
       const elapsed = Date.now() - startTime;
       
       // Проверяем, была ли ошибка вызвана отменой
       if (error instanceof Error && error.name === 'AbortError') {
         console.log(`[LLMService] Generation aborted for chat ${chatId} after ${elapsed}ms`);
         this.activeAbortControllers.delete(chatId);
         return; // Graceful exit on abort
       }
       
       console.error(`LLM Stream Error after ${elapsed}ms:`, error);

       if (elapsed > timeoutMs) {
         throw new Error('Request timeout');
       }

       throw error;
     }
  }

  /**
   * Fallback stream generation для тестирования без llm-client
   */
  private async *generateFallbackStream(userMessage: string): AsyncGenerator<StreamChunk> {
    // Эмуляция reasoning
    const reasoning = 'Я анализирую сообщение пользователя и формирую ответ...';
    for (const char of reasoning) {
      yield { type: 'reasoning_token', token: char };
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Эмуляция content
    const content = `Получено сообщение: "${userMessage}". Это эмуляция ответа.`;
    for (const char of content) {
      yield { type: 'content_token', token: char };
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }

  /**
   * Генерация полного ответа (без потока)
   */
  async generate(
    userId: number,
    chatId: number,
    userMessage: string
  ): Promise<string> {
    let fullContent = '';

    for await (const chunk of this.generateStream(userId, chatId, userMessage)) {
      if (chunk.type === 'content_token') {
        fullContent += chunk.token;
      }
    }

    return fullContent;
  }

  /**
   * Генерация текста на основе простого промпта (без привязки к чату)
   * @param prompt - Промпт для генерации
   * @returns Сгенерированный текст
   */
  async generateFromPrompt(prompt: string): Promise<string> {
    const messages: LLMMessage[] = [
      {
        role: 'user',
        content: prompt
      }
    ];

    // Проверяем наличие клиента
    if (!this.client) {
      throw new Error('LLM client not available');
    }

    // Отправляем запрос к LLM без потока
    const response = await this.client.chatCompletionsCreate({
      model: this.model,
      messages: messages,
      stream: false,
      temperature: 0.7,
      max_tokens: parseInt(process.env.LLM_MAX_TOKENS || '') || 64000,
    });

    const content = response.choices?.[0]?.message?.content || '';
    return content;
  }
}

export const llmService = new LLMService();
