/**
 * Compression Service - Умное сжатие истории
 *
 * Основные функции:
 * 1. Анализ истории и разбивка на семантические блоки
 * 2. Генерация кратких пересказов для каждого блока
 * 3. Интеграция с LLM для суммаризации
 * 4. Поддержка ручного выделения сообщений
 */

import crypto from 'crypto';
import db from '../config/database';
import { chatRepository, Message } from '../repositories/chat.repository';
import { chatBlockRepository, ChatBlock, CreateChatBlockParams } from '../repositories/chat-block.repository';
import { characterRepository } from '../repositories/character.repository';
import { heroVariationRepository } from '../repositories/hero.variation.repository';
import { llmService, LLMMessage } from './llm.service';
import { translationService } from './translation.service';
import { llmConnectionRepository } from '../repositories/llm-connection.repository';

export type CompressionMethod = 'fixed' | 'semantic';

export interface CompressionOptions {
  maxBlockMessages?: number;    // Максимальное количество сообщений в блоке (эвристика)
  summaryTemperature?: number;  // Temperature для генерации пересказа
  compressionMethod?: CompressionMethod; // Метод сжатия: 'fixed' (по N сообщений) или 'semantic' (смысловые главы)
  onProgress?: CompressionProgressCallback; // Callback для отправки прогресса
}

export interface CompressionProgressData {
  currentBlock: number;
  totalBlocks: number;
  status: string;
  title?: string;
  startPosition?: number;  // Порядковый номер первого сообщения в блоке (1-based)
  endPosition?: number;    // Порядковый номер последнего сообщения в блоке (1-based)
}

export interface SemanticChapter {
  title: string;
  startMessageId: number;
  endMessageId: number;
  messageIds: number[];
}

export type CompressionProgressCallback = (progress: CompressionProgressData) => void;

export interface CompressionBlock {
  title: string;
  summary: string;
  messageIds: number[];
  startMessageId: number;
  endMessageId: number;
}

export interface CompressionResult {
  blocks: ChatBlock[];
  originalCount: number;        // Количество оригинальных сообщений
  compressedCount: number;      // Количество сжатых блоков
  tokenSavings: number;         // Примерная экономия токенов
}

/**
 * Разбивка сообщений на семантические блоки
 * Использует эвристику на основе количества сообщений и смены темы
 */
interface SemanticBlock {
  messages: Message[];
  startMessageId: number;
  endMessageId: number;
}

export class CompressionService {
  private readonly DEFAULT_MAX_BLOCK_MESSAGES = 20;
  private readonly SUMMARY_TEMPERATURE = 0.7;

  // ==================== Retry Configuration for Compression ====================
  /**
   * Максимальное количество повторных попыток при ошибках API сжатия
   */
  private readonly maxRetries: number = 3;

  /**
   * Базовая задержка между повторными попытками (в миллисекундах)
   */
  private readonly baseRetryDelay: number = 2000; // 2 секунды (больше чем для обычного стриминга)

  /**
   * Максимальная задержка между повторными попытками (в миллисекундах)
   */
  private readonly maxRetryDelay: number = 30000; // 30 секунд

  /**
   * Проверяет, является ли ошибка "временной" и требует повторной попытки.
   */
  private isCompressionRetryableError(error: any): { retryable: boolean; delay?: number } {
    if (error?.name === 'AbortError') {
      return { retryable: false };
    }

    const message = error?.message || String(error);
    const statusCode = error?.status || error?.response?.status;
    const code = error?.code;

    // HTTP 429 — rate limiting, повторяем с увеличенной задержкой
    if (statusCode === 429) {
      return { retryable: true, delay: this.baseRetryDelay * 3 };
    }

    // HTTP 5xx серверные ошибки
    if (statusCode && statusCode >= 500 && statusCode < 600) {
      return { retryable: true };
    }

    // Сетевые ошибки
    if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || 
        code === 'EAI_AGAIN' || code === 'ENOTFOUND') {
      return { retryable: true };
    }

    // Timeout / network errors
    if (message.includes('timeout') || message.includes('network error') || 
        message.includes('fetch failed') || message.toLowerCase().includes('econnrefused')) {
      return { retryable: true };
    }

    // Не повторяем
    if (statusCode === 400 || statusCode === 401 || statusCode === 403 || 
        statusCode === 404 || statusCode === 413) {
      return { retryable: false };
    }

    return { retryable: true, delay: this.baseRetryDelay };
  }

  /**
   * Выполняет операцию с повторными попытками и экспоненциальной задержкой.
   */
  private async withCompressionRetry<T>(
    operation: () => Promise<T>,
    contextLabel: string,
    maxRetries: number = this.maxRetries,
    baseDelay: number = this.baseRetryDelay
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const { retryable, delay } = this.isCompressionRetryableError(error);
        
        if (!retryable || attempt >= maxRetries) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (!retryable) {
            console.log(`[CompressionService.${contextLabel}] Non-retryable error:`, errorMsg);
          } else {
            console.error(`[CompressionService.${contextLabel}] Max retries (${maxRetries}) reached. Last error:`, errorMsg);
          }
          throw error;
        }

        const exponentialDelay = baseDelay * Math.pow(2, attempt);
        const actualDelay = Math.min(exponentialDelay, delay ?? this.maxRetryDelay);
        const errorMsg = error instanceof Error ? error.message : String(error);

        console.log(
          `[CompressionService.${contextLabel}] Retry ${attempt + 1}/${maxRetries} in ${actualDelay}ms... ` +
          `(Error: ${errorMsg})`
        );

        await new Promise(resolve => setTimeout(resolve, actualDelay));
      }
    }

    throw lastError;
  }

  /**
   * Получает порядковый номер (1-based) сообщения по его ID в массиве сообщений.
   * Сообщения отсортированы по created_at ASC, поэтому позиция = индекс + 1.
   */
  private getMessagePosition(messageId: number, messages: Message[]): number {
    const index = messages.findIndex(m => m.id === messageId);
    return index >= 0 ? index + 1 : 0;
  }

  /**
   * Получает конфигурацию активного LLM-соединения пользователя из БД.
   * Fallback на environment variables, если соединение не найдено.
   */
  private getLlmConnectionConfig(userId?: number): { baseURL: string; apiKey: string; model: string } {
    if (userId) {
      const activeConn = llmConnectionRepository.getActiveByUserId(userId);
      if (activeConn) {
        const connWithKey = llmConnectionRepository.getByIdWithDecryptedKey(activeConn.id);
        if (connWithKey) {
          console.log(`[CompressionService] >>> Using active LLM connection: ${activeConn.name} (${activeConn.base_url})`);
          return {
            baseURL: activeConn.base_url,
            apiKey: connWithKey.api_key_decrypted || '',
            model: activeConn.model,
          };
        }
      }
    }
    console.log('[CompressionService] >>> Fallback: using environment variables for LLM connection');
    return {
      baseURL: process.env.LLM_BASE_URL || 'http://localhost:1234/v1',
      apiKey: process.env.LLM_API_KEY || 'local-model-key',
      model: process.env.LLM_MODEL || 'qwen-3.5',
    };
  }
  private readonly DEFAULT_COMPRESSION_SYSTEM_INSTRUCTIONS = `Ты — опытный редактор и летописец. Твоя задача — создавать структурированные, информативные краткие пересказы диалогов и событий.

ПРАВИЛА ФОРМАТИРОВАНИЯ ПЕРЕСКАЗА:
- Пиши пересказ в формате с тегами-категориями: [Действия] ... [Диалоги] ... [Изменения] ... [Детали] ...
- Если какой-то категории нет — просто пропусти её
- Пиши фактами, без эмоциональных описаний, запахов, атмосферы
- Сохраняй имена персонажей, названия мест, предметы, концепции
- Описывай конкретные события и их последствия
- Сохраняй информацию о решениях, обещаниях, открытиях персонажей
- Если персонаж получил новый предмет/навык/информацию — обязательно укажи
- Если отношения между персонажами изменились — укажи

СТРУКТУРА КАЖДОЙ КАТЕГОРИИ:
[Действия] — что конкретно сделали персонажи, куда пошли, что предприняли
[Диалоги] — ключевые реплики и их смысл (не дословно, а по сути)
[Изменения] — что изменилось: отношения, локации, статус, знания персонажей
[Детали] — важные сюжетные детали, упоминания будущих событий, загадочные элементы

ПРИМЕР ХОРОШЕГО ПЕРЕСКАЗА:
[Действия] Аэрин и Торин вошли в таверну "Пьяный грифон". Аэрин подошла к стойке и заказала эль, затем подошла к старику-торговцу в углу. [Диалоги] Торговец подтвердил слухи о нападениях на северной дороге и упомянул странные огни над горами. [Изменения] Герои узнали о новой преграде на пути в Северные земли. [Детали] Старик шепнул про "огненных стражей" и предложил 50 золотых за провожатого.`;

  /**
   * Получает системные инструкции для сжатия из настроек пользователя.
   * Если настройка не задана — возвращает инструкции по умолчанию.
   */
  private async getCompressionSystemInstructions(userId: number): Promise<string> {
    try {
      const result = db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(
        userId,
        'compression_system_instructions'
      ) as { value: string | null } | undefined;

      if (result?.value && result.value.trim().length > 0) {
        return result.value.trim();
      }
    } catch (error) {
      console.error('[CompressionService] Error reading compression instructions from settings:', error);
    }

    return this.DEFAULT_COMPRESSION_SYSTEM_INSTRUCTIONS;
  }

  /**
   * Извлекает ответ от LLM из reasoning-текста (когда content пустой)
   * Фильтрует thinking-процесс и ищет реальный ответ
   */
  private extractResponseFromReasoning(reasoningContent: string): string {
    console.log('[CompressionService] >>> Extracting response from reasoning...');

    // Сначала пробуем найти маркеры ЗАГОЛОВОК/ПЕРЕСКАЗ прямо в reasoning
    const titleDirectMatch = reasoningContent.match(/ЗАГОЛОВОК:\s*(.+?)(?:\n|$)/i);
    const summaryDirectMatch = reasoningContent.match(/ПЕРЕСКАЗ:\s*([\s\S]+?)(?=\n\nПЕРЕСКАЗ:|\n\nЗАГОЛОВОК:|\n\n|$)/i);
    
    if (titleDirectMatch || summaryDirectMatch) {
      console.log('[CompressionService] >>> Found direct format matches in reasoning');
      const fullText = [];
      if (titleDirectMatch) fullText.push(`ЗАГОЛОВОК: ${titleDirectMatch[1].trim()}`);
      if (summaryDirectMatch) fullText.push(`ПЕРЕСКАЗ: ${summaryDirectMatch[1].trim()}`);
      return fullText.join('\n');
    }

    // LLM с reasoning mode выводит мыслительный процесс, а content пустой
    // Нужно извлечь ответ из reasoning — ищем текст после маркеров конца thinking
    
    const lines = reasoningContent.split('\n');
    
    // Стратегия 1: Ищем строку "Language:" и берём всё после неё
    let foundAt = -1;
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].trim().toLowerCase();
      if (lower.includes('language:') && lower.includes('russian') || lower.includes('language:') && lower.includes('english') || lower.includes('language:') && lower.includes('latin')) {
        foundAt = i + 1;
        console.log('[CompressionService] >>> Found "language:" at line', i);
        break;
      }
      if (lower === 'language: russian' || lower === 'language: english' || lower.includes('language:')) {
        foundAt = i + 1;
        console.log('[CompressionService] >>> Found "language:" at line', i);
        break;
      }
    }
    
    // Стратегия 2: Ищем конец маркированного списка (последний "- **...:**" + пустая строка)
    if (foundAt < 0) {
      let lastListItemEnd = -1;
      let consecutiveEmptyLines = 0;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (/^- \*\*/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
          lastListItemEnd = i;
          consecutiveEmptyLines = 0;
        } else if (trimmed === '' && lastListItemEnd > 0) {
          // Пустая строка после списка — возможное начало ответа
          foundAt = i + 1;
          console.log('[CompressionService] >>> Found empty line after list at line', i);
          break;
        }
      }
    }
    
    // Стратегия 3: Ищем маркеры конца анализа
    if (foundAt < 0) {
      for (let i = 0; i < lines.length; i++) {
        const lower = lines[i].trim().toLowerCase();
        if (lower.includes('content:') && lower.includes('preserves')) {
          foundAt = i + 1;
          console.log('[CompressionService] >>> Found "content:" at line', i);
          break;
        }
        if (lower.includes('format:') && lower.includes('summary length')) {
          foundAt = i + 1;
          console.log('[CompressionService] >>> Found "format:" at line', i);
          break;
        }
      }
    }
    
    // Стратегия 4: Ищем "Here's a thinking process:" и берём текст после последнего абзаца
    if (foundAt < 0) {
      let thinkingStart = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().toLowerCase().includes("here's a thinking") || lines[i].trim().toLowerCase().includes('let me think')) {
          thinkingStart = i;
          break;
        }
      }
      if (thinkingStart >= 0) {
        // Берём последние 3000 символов после начала thinking
        const afterThinking = lines.slice(thinkingStart).join('\n');
        const lastChars = afterThinking.slice(-3000);
        if (lastChars.length > 50) {
          foundAt = -1; // fallback ниже
          const extracted = lastChars.trim();
          console.log('[CompressionService] >>> Using last 3000 chars fallback:', extracted.substring(0, 200));
          return extracted;
        }
      }
    }
    
    // Стратегия 5: Берём текст после N-й строки (пропускаем первые 20 строк thinking)
    if (foundAt < 0) {
      foundAt = 25;
      console.log('[CompressionService] >>> Using skip 25 lines fallback');
    }
    
    const extracted = lines.slice(foundAt).join('\n').trim();
    if (extracted.length > 50) {
      console.log('[CompressionService] >>> Extracted from reasoning:', extracted.substring(0, 300));
      return extracted;
    }
    
    // Последний fallback: берём последние 4000 символов
    const lastPart = reasoningContent.slice(-4000).trim();
    console.log('[CompressionService] >>> Using last 4000 chars fallback:', lastPart.substring(0, 200));
    return lastPart;
  }

  /**
   * Автоматическое сжатие истории чата
   * Выбирает метод сжатия в зависимости от compressionMethod:
   * - 'fixed' (по умолчанию): разбивка по фиксированному количеству сообщений
   * - 'semantic': разбивка на смысловые главы через LLM
   */
  async compressChat(
    chatId: number,
    userId: number,
    options?: CompressionOptions
  ): Promise<CompressionResult> {
    const compressionMethod = options?.compressionMethod ?? 'fixed';
    
    if (compressionMethod === 'semantic') {
      return this.compressIntoSemanticChapters(chatId, userId, options);
    }
    
    return this.compressWithFixedBlocks(chatId, userId, options);
  }

  /**
   * Сжатие с фиксированными блогами (старый метод, по N сообщений)
   */
  private async compressWithFixedBlocks(
    chatId: number,
    userId: number,
    options?: CompressionOptions
  ): Promise<CompressionResult> {
    const maxBlockMessages = options?.maxBlockMessages ?? this.DEFAULT_MAX_BLOCK_MESSAGES;
    const onProgress = options?.onProgress;
    
    // 1. Получаем историю сообщений
    const chatWithMessages = chatRepository.getChatWithMessages(chatId);
    if (!chatWithMessages || !chatWithMessages.messages || chatWithMessages.messages.length === 0) {
      throw new Error('Chat not found or no messages');
    }

    const messages = chatWithMessages.messages;
    const originalCount = messages.length;

    // 2. Получаем персонаж для контекста
    const character = characterRepository.getCharacterById(chatWithMessages.character_id);
    if (!character) {
      throw new Error('Character not found');
    }

    // 3. Получаем профиль героя
    const heroProfile = heroVariationRepository.getHeroProfileForLLM(userId);
    const activeHero = heroVariationRepository.getActiveHeroVariationByUserId(userId);
    const heroName = activeHero?.name || null;

    // 4. Получаем уже сжатые блоки и исключаем их сообщения из обработки
    const existingBlocks = chatBlockRepository.getBlocksByChatId(chatId);
    const compressedMessageIds: Set<number> = new Set();
    
    for (const block of existingBlocks) {
      try {
        const ids: number[] = JSON.parse(block.original_message_ids || '[]');
        for (const id of ids) {
          compressedMessageIds.add(id);
        }
      } catch (e) {
        console.warn('[CompressionService] Failed to parse original_message_ids for block:', block.id, e);
      }
    }
    
    // Фильтруем уже сжатые сообщения — они не должны участвовать в новом сжатии
    const uncompressedMessages = messages.filter(msg => !compressedMessageIds.has(msg.id));
    
    if (uncompressedMessages.length === 0) {
      throw new Error('Все сообщения уже сжаты. Сбросьте блоки сжатия для повторного сжатия.');
    }

    console.log('[CompressionService] >>> Total messages:', messages.length, '| Already compressed:', compressedMessageIds.size, '| Uncompressed to process:', uncompressedMessages.length);

    // 5. Разбиваем на семантические блоки только несжатые сообщения
    const semanticBlocks = this.splitIntoSemanticBlocks(uncompressedMessages, maxBlockMessages);
    const totalBlocks = semanticBlocks.length;

    // Отправляем начальный прогресс
    if (onProgress) {
      onProgress({ currentBlock: 0, totalBlocks, status: 'Начало сжатия...' });
    }

    // 6. Генерируем summary для каждого блока
    const previousSummaries = existingBlocks.map(b => b.summary);

    const compressionBlocks: CompressionBlock[] = [];
    let sortOrder = chatBlockRepository.getMaxSortOrder(chatId);

    for (let i = 0; i < semanticBlocks.length; i++) {
      const block = semanticBlocks[i];
      const currentBlockNum = i + 1;

      // Вычисляем порядковые номера для отображения пользователю (относительно оригинального списка всех сообщений)
      const startPos = this.getMessagePosition(block.startMessageId, messages);
      const endPos = this.getMessagePosition(block.endMessageId, messages);
      const posRange = startPos > 0 && endPos > 0 ? `${startPos}-${endPos}` : '';

      // Отправляем прогресс перед обработкой блока
      if (onProgress) {
        onProgress({ 
          currentBlock: currentBlockNum - 1, 
          totalBlocks, 
          status: `Обработка блока ${currentBlockNum} из ${totalBlocks}${posRange ? ` [${posRange}]` : ''}...`,
          startPosition: startPos,
          endPosition: endPos,
        });
      }

      // Перевод отключён по умолчанию
      const useTranslations = false;

      const compressionBlock = await this.generateBlockSummary(
        block,
        previousSummaries,
        character,
        heroProfile,
        heroName,
        useTranslations,
        userId
      );
      compressionBlocks.push(compressionBlock);

      // Сохраняем блок в БД
      const params: CreateChatBlockParams = {
        chat_id: chatId,
        title: compressionBlock.title,
        summary: compressionBlock.summary,
        original_message_ids: compressionBlock.messageIds,
        start_message_id: compressionBlock.startMessageId,
        end_message_id: compressionBlock.endMessageId,
        sort_order: ++sortOrder
      };
      chatBlockRepository.createBlock(params);
      previousSummaries.push(compressionBlock.summary);

      // Отправляем прогресс после завершения блока
      if (onProgress) {
        onProgress({ 
          currentBlock: currentBlockNum, 
          totalBlocks, 
          status: `Обработан блок ${currentBlockNum} из ${totalBlocks}${posRange ? ` [${posRange}]` : ''}`,
          title: compressionBlock.title,
          startPosition: startPos,
          endPosition: endPos,
        });
      }
    }

    // Отправляем финальный прогресс
    if (onProgress) {
      onProgress({ 
        currentBlock: totalBlocks, 
        totalBlocks, 
        status: 'Сжатие завершено' 
      });
    }

    // 7. Возвращаем результат
    const savedBlocks = chatBlockRepository.getBlocksByChatId(chatId);
    const tokenSavings = this.estimateTokenSavings(messages, savedBlocks);

    return {
      blocks: savedBlocks,
      originalCount,
      compressedCount: compressionBlocks.length,
      tokenSavings
    };
  }

  /**
   * Сжатие истории на смысловые главы через LLM
   * 
   * Процесс:
   * 1. Читаем ВСЮ историю от начала до конца
   * 2. Отправляем LLM запрос на разбивку на смысловые главы
   * 3. LLM возвращает структуру: [1-13] Глава 1, [14-24] Глава 2, ...
   * 4. Для каждой главы генерируем summary
   * 5. Сохраняем блоки в БД
   */
  private async compressIntoSemanticChapters(
    chatId: number,
    userId: number,
    options?: CompressionOptions
  ): Promise<CompressionResult> {
    const onProgress = options?.onProgress;
    
    // 1. Получаем историю сообщений
    const chatWithMessages = chatRepository.getChatWithMessages(chatId);
    if (!chatWithMessages || !chatWithMessages.messages || chatWithMessages.messages.length === 0) {
      throw new Error('Chat not found or no messages');
    }

    const messages = chatWithMessages.messages;
    const originalCount = messages.length;

    if (messages.length < 10) {
      throw new Error('Для семантического сжатия нужно минимум 10 сообщений');
    }

    // 2. Получаем персонаж для контекста
    const character = characterRepository.getCharacterById(chatWithMessages.character_id);
    if (!character) {
      throw new Error('Character not found');
    }

    // 3. Получаем профиль героя
    const heroProfile = heroVariationRepository.getHeroProfileForLLM(userId);
    const activeHero = heroVariationRepository.getActiveHeroVariationByUserId(userId);
    const heroName = activeHero?.name || null;

    // 4. Отправляем всю историю LLM для разбивки на главы
    if (onProgress) {
      onProgress({ 
        currentBlock: 0, 
        totalBlocks: 1, 
        status: 'Формируется список глав для разбиения истории на блоки...' 
      });
    }

    const chapters = await this.splitHistoryIntoSemanticChapters(messages, userId, chatId);
    const totalBlocks = chapters.length;

    if (totalBlocks === 0) {
      throw new Error('LLM не смог разбить историю на главы');
    }

    // Обновляем totalBlocks на реальное количество глав
    if (onProgress) {
      onProgress({ 
        currentBlock: 0, 
        totalBlocks, 
        status: `Найдено ${totalBlocks} глав. Начало обработки...` 
      });
    }

    // 5. Генерируем summary для каждой главы
    const existingBlocks = chatBlockRepository.getBlocksByChatId(chatId);
    const previousSummaries = [...existingBlocks.map(b => b.summary)];

    const compressionBlocks: CompressionBlock[] = [];
    let sortOrder = chatBlockRepository.getMaxSortOrder(chatId);

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const currentBlockNum = i + 1;

      // Получаем сообщения главы
      const chapterMessages = messages.filter(m => m.id >= chapter.startMessageId && m.id <= chapter.endMessageId);
      
      const block: SemanticBlock = {
        messages: chapterMessages,
        startMessageId: chapter.startMessageId,
        endMessageId: chapter.endMessageId
      };

      // Вычисляем порядковые номера для отображения пользователю
      const startPos = this.getMessagePosition(chapter.startMessageId, messages);
      const endPos = this.getMessagePosition(chapter.endMessageId, messages);
      const posRange = startPos > 0 && endPos > 0 ? `${startPos}-${endPos}` : '';
      const msgCount = chapterMessages.length;

      // Отправляем прогресс перед обработкой блока
      if (onProgress) {
        onProgress({ 
          currentBlock: currentBlockNum - 1, 
          totalBlocks, 
          status: `Обработка: Блок ${currentBlockNum} [${posRange || 'Сообщения ' + chapter.startMessageId + '-' + chapter.endMessageId}] из ${totalBlocks} блоков (${msgCount} сообщ.)`,
          title: chapter.title,
          startPosition: startPos,
          endPosition: endPos,
        });
      }

      const compressionBlock = await this.generateBlockSummary(
        block,
        previousSummaries,
        character,
        heroProfile,
        heroName,
        false, // useTranslations
        userId
      );
      
      // Используем заголовок главы как title блока
      compressionBlock.title = chapter.title;
      
      compressionBlocks.push(compressionBlock);

      // Сохраняем блок в БД
      const params: CreateChatBlockParams = {
        chat_id: chatId,
        title: compressionBlock.title,
        summary: compressionBlock.summary,
        original_message_ids: compressionBlock.messageIds,
        start_message_id: compressionBlock.startMessageId,
        end_message_id: compressionBlock.endMessageId,
        sort_order: ++sortOrder
      };
      chatBlockRepository.createBlock(params);
      previousSummaries.push(compressionBlock.summary);

      // Отправляем прогресс после завершения блока
      if (onProgress) {
        onProgress({ 
          currentBlock: currentBlockNum, 
          totalBlocks, 
          status: `Обработан: Блок ${currentBlockNum} [${posRange || chapter.startMessageId + '-' + chapter.endMessageId}] — ${chapter.title}`,
          title: chapter.title,
          startPosition: startPos,
          endPosition: endPos,
        });
      }
    }

    // Отправляем финальный прогресс
    if (onProgress) {
      onProgress({ 
        currentBlock: totalBlocks, 
        totalBlocks, 
        status: `Семантическое сжатие завершено! ${totalBlocks} блоков создано.` 
      });
    }

    // 6. Возвращаем результат
    const savedBlocks = chatBlockRepository.getBlocksByChatId(chatId);
    const tokenSavings = this.estimateTokenSavings(messages, savedBlocks);

    return {
      blocks: savedBlocks,
      originalCount,
      compressedCount: compressionBlocks.length,
      tokenSavings
    };
  }

  /**
   * Разбивка всей истории на смысловые главы через LLM
   * LLM возвращает структуру в формате: [start-end] Название главы
   * 
   * Каждое сообщение в тексте имеет явный ID в формате [ID:123], чтобы LLM мог определить границы.
   * ЧИТАЕТ ВСЮ ИСТОРИЮ ЦЕЛИКОМ без каких-либо ограничений — это ключевое требование смыслового анализа.
   * 
   * ВАЖНО: Сообщения, уже сжатые в блоки, отправляются с указанием диапазона ID блока.
   * Формат: [BLOCK:15-28] Название главы\nsummary блока
   * Это позволяет LLM видеть какие диапазоны уже заняты и не включать их в новые главы.
   */
  private async splitHistoryIntoSemanticChapters(messages: Message[], userId: number, chatId?: number): Promise<SemanticChapter[]> {
    // Получаем уже сжатые блоки для этого чата
    let compressedMessageIds: Set<number> = new Set();
    // Map: startId -> { endId, title, summary } для каждого блока
    const compressedBlockInfoMap = new Map<number, { endId: number; title: string; summary: string }>();
    
    if (chatId) {
      const existingBlocks = chatBlockRepository.getBlocksByChatId(chatId);
      for (const block of existingBlocks) {
        const ids = JSON.parse(block.original_message_ids || '[]');
        if (ids.length === 0) continue;
        
        const startId = Math.min(...ids);
        const endId = Math.max(...ids);
        
        // Добавляем все ID блока в set
        for (const id of ids) {
          compressedMessageIds.add(id);
        }
        
        // Сохраняем информацию о блоке
        compressedBlockInfoMap.set(startId, {
          endId,
          title: block.title || 'Сжатый блок',
          summary: block.summary || ''
        });
      }
      console.log('[CompressionService] >>> Found', compressedMessageIds.size, 'already compressed message IDs');
      console.log('[CompressionService] >>> Found', compressedBlockInfoMap.size, 'compressed blocks');
    }

    // Формируем "виртуальную" историю для анализа:
    // - Несжатые сообщения отправляются как есть: [ID:123] Роль: текст
    // - Сжатые блоки отправляются как: [BLOCK:15-28] Название\nsummary
    // Это позволяет LLM видеть какие диапазоны уже заняты!
    const historyParts: string[] = [];
    const uncompressedMessageIds: number[] = [];
    
    // Дедупликация блоков по диапазону [startId-endId], чтобы избежать дублирования
    // если в БД есть повторяющиеся блоки с одинаковыми границами.
    const processedBlockRanges = new Set<string>();
    const allBlocks = chatId ? chatBlockRepository.getBlocksByChatId(chatId) : [];
    
    // Сортируем блоки по start_message_id для корректного порядка в истории
    const sortedBlocks = [...allBlocks].sort((a, b) => {
      const aStart = a.start_message_id ?? 0;
      const bStart = b.start_message_id ?? 0;
      return aStart - bStart;
    });
    
    // Сначала добавляем информацию о сжатых блоках (в порядке start_message_id, без дублей)
    for (const block of sortedBlocks) {
      if (!block.start_message_id || !block.end_message_id) continue;
      
      const rangeKey = `${block.start_message_id}-${block.end_message_id}`;
      if (processedBlockRanges.has(rangeKey)) {
        // Пропускаем дубликат блока с теми же границами
        continue;
      }
      processedBlockRanges.add(rangeKey);
      
      historyParts.push(`[BLOCK:${block.start_message_id}-${block.end_message_id}] ${block.title || 'Сжатый блок'}`);
      historyParts.push(block.summary || '');
      historyParts.push('---');
    }
    
    // Затем добавляем несжатые сообщения (пропускаем те, что уже в блоках)
    for (const msg of messages) {
      if (!msg.id) continue;
      if (compressedMessageIds.has(msg.id)) {
        // Это сообщение уже в каком-то блоке — пропускаем, оно уже учтено выше
        continue;
      }
      
      // Это сообщение не сжато — отправляем его полностью
      const role = msg.role === 'user' ? 'Пользователь' : 'Персонаж';
      const content = msg.content || '';
      historyParts.push(`[ID:${msg.id}] ${role}: ${content}`);
      uncompressedMessageIds.push(msg.id);
    }

    const historyText = historyParts.join('\n');

    // Если все сообщения уже сжаты — нечего анализировать
    if (uncompressedMessageIds.length === 0) {
      console.log('[CompressionService] >>> No uncompressed messages to process');
      return [];
    }

    // Читаем ВСЮ историю от начала до конца — никаких ограничений!
    // Смысловой анализ требует полного контекста, усечение сломает логику повествования
    const firstMsgId = uncompressedMessageIds[0];
    const lastMsgId = uncompressedMessageIds[uncompressedMessageIds.length - 1];

    // Промпт для LLM — разбивка на главы
    const systemMessage = `Ты — эксперт по анализу структуры повествования. Твоя задача — разбить текст диалога/истории на логические смысловые главы (сцены, события, смены темы).

Строго запрещено:
- Писать рассуждения или объяснения
- Использовать списки или нумерацию вне формата
- Выводить что-либо кроме формата [start-end] Название главы

Если ты не следуешь этому правилу, система сломается. Отвечай ТОЛЬКО в указанном формате.`;

    const prompt = `Разбери следующую ПОЛНУЮ историю на смысловые главы (главы/сцены/события).

Формат ответа строгий — каждая глава на новой строке:
[start_message_id-end_message_id] Название главы

Правила:
1. Определи логические границы глав на основе смены сцены, темы, времени или события
2. В тексте каждое НЕСЖАТОЕ сообщение имеет явный ID в формате [ID:123] — используй эти реальные ID для определения границ
3. Сообщения с пометкой [BLOCK:15-28] уже были сжаты в блоки — НЕ включай эти диапазоны в новые главы!
4. Название главы — короткое, до 8 слов, отражающее СУТЬ главы
5. ВСЕ несжатые сообщения должны быть покрыты — диапазоны идут ПОДРЯД без пробелов от первого до последнего ID
6. Не бойся создавать много глав — лучше больше маленьких, чем одна огромная
7. Если история небольшая, выдели 1-3 главы

Пример ответа:
[15-28] Встреча в таверне
[29-45] Разговор с торговцем
[46-62] Нападение в темном переулке
[63-80] Подготовка к путешествию

---
ПОЛНАЯ ИСТОРИЯ:
- Сжатые блоки помечены [BLOCK:startId-endId] с названием и summary
- Несжатые сообщения имеют [ID:номер]

${historyText}

Статистика:
- Первый ID несжатого сообщения: ${firstMsgId}
- Последний ID несжатого сообщения: ${lastMsgId}
- Всего несжатых сообщений для анализа: ${uncompressedMessageIds.length}
- Уже сжато блоков: ${compressedBlockInfoMap.size}

ТВОЯ ЗАДАЧА: Разбей НЕСЖАТЫЕ сообщения на логические главы, используя реальные ID сообщений.
НЕ включай диапазоны, которые уже помечены как [BLOCK:x-y].

Ответь ТОЛЬКО в формате [start-end] Название главы, ничего больше.`;

    const llmMessages: LLMMessage[] = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: prompt }
    ];

    try {
      console.log('[CompressionService] >>> Sending full history to LLM for chapter splitting...');
      console.log('[CompressionService] >>> Uncompressed messages to analyze:', uncompressedMessageIds.length);
      console.log('[CompressionService] >>> Already compressed blocks:', compressedBlockInfoMap.size);
      console.log('[CompressionService] >>> History text length:', historyText.length);
      console.log('[CompressionService] >>> Message ID range:', firstMsgId, '-', lastMsgId);

      // Получаем конфигурацию LLM из активного соединения пользователя
      const llmConfig = this.getLlmConnectionConfig(userId);

      // Вызываем API с retry логикой при временных ошибках
      const response = await this.withCompressionRetry(
        async () => {
          const { LLMClient } = require('llm-client');
          const client = new LLMClient({
            baseURL: llmConfig.baseURL,
            apiKey: llmConfig.apiKey,
            timeout: 900000, // 15 минут на обработку — история может быть большой
          });

          return await client.chatCompletionsCreate({
            model: llmConfig.model,
            messages: llmMessages,
            temperature: 0.5, // Ниже температура для более структурированного вывода
            max_tokens: 4000, // Больше токенов для вывода многих глав
          });
        },
        `splitHistoryIntoSemanticChapters chat${chatId}`
      );

      const message = response.choices?.[0]?.message;
      const content = message?.content || '';
      const reasoningContent = message?.reasoning || message?.reasoning_content || '';
      
      // Извлекаем ответ из reasoning если нужно
      let finalContent = content;
      if (!content && reasoningContent) {
        finalContent = this.extractResponseFromReasoning(reasoningContent);
      }

      // Парсим ответ LLM — формат [start-end] Название главы
      const chapters = this.parseChaptersFromLLMResponse(finalContent, firstMsgId, lastMsgId, uncompressedMessageIds);
      
      console.log('[CompressionService] >>> Semantic chapters parsed:', chapters.length);
      
      return chapters;
    } catch (error) {
      console.error('[CompressionService] Error splitting history into chapters:', error);
      
      // Fallback: разбиваем на равные части по 30 сообщений
      console.log('[CompressionService] >>> Fallback: splitting into equal parts of 30 messages');
      return this.splitIntoFallbackChapters(
        { id: uncompressedMessageIds[0] || 0 },
        { id: uncompressedMessageIds[uncompressedMessageIds.length - 1] || 0 },
        uncompressedMessageIds
      );
    }
  }

  /**
   * Парсинг ответа LLM в структуру глав
   * Формат ответа: [start-end] Название главы
   */
  private parseChaptersFromLLMResponse(
    response: string,
    firstMsgId: number,
    lastMsgId: number,
    allMessageIds: number[]
  ): SemanticChapter[] {
    const chapters: SemanticChapter[] = [];
    
    // Ищем паттерн [start-end] Название
    const chapterRegex = /\[(\d+)-(\d+)\]\s*(.+)/gi;
    let match;
    
    while ((match = chapterRegex.exec(response)) !== null) {
      const startId = parseInt(match[1], 10);
      const endId = parseInt(match[2], 10);
      const title = match[3].trim();
      
      // Проверяем валидность диапазона
      if (startId >= firstMsgId && endId <= lastMsgId && startId <= endId) {
        // Находим сообщения в этом диапазоне
        const messageIds = allMessageIds.filter(id => id >= startId && id <= endId);
        
        if (messageIds.length > 0) {
          chapters.push({
            title,
            startMessageId: startId,
            endMessageId: endId,
            messageIds
          });
        }
      }
    }
    
    // Если LLM не смог распарсить — используем fallback
    if (chapters.length === 0) {
      console.log('[CompressionService] >>> Failed to parse chapters from LLM, using fallback');
      return this.splitIntoFallbackChapters(
        { id: firstMsgId } as any,
        { id: lastMsgId } as any,
        allMessageIds
      );
    }
    
    // Проверяем что все сообщения покрыты
    const coveredIds = new Set<number>();
    for (const ch of chapters) {
      for (const id of ch.messageIds) {
        coveredIds.add(id);
      }
    }
    
    const missingIds = allMessageIds.filter(id => !coveredIds.has(id));
    if (missingIds.length > 0 && chapters.length > 0) {
      console.log('[CompressionService] >>> Missing message IDs in chapters:', missingIds.length);
      // Добавляем пропущенные сообщения к ближайшей главе
      for (const missingId of missingIds) {
        let nearestChapter = chapters[0];
        let nearestDist = Math.abs(missingId - nearestChapter.startMessageId);
        
        for (const ch of chapters) {
          const distToStart = Math.abs(missingId - ch.startMessageId);
          const distToEnd = Math.abs(missingId - ch.endMessageId);
          const dist = Math.min(distToStart, distToEnd);
          
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestChapter = ch;
          }
        }
        
        nearestChapter.messageIds.push(missingId);
        if (missingId < nearestChapter.startMessageId) {
          nearestChapter.startMessageId = missingId;
        }
        if (missingId > nearestChapter.endMessageId) {
          nearestChapter.endMessageId = missingId;
        }
      }
    }
    
    return chapters;
  }

  /**
   * Fallback разбивка на главы — равные части по ~30 сообщений
   */
  private splitIntoFallbackChapters(
    firstMsg: { id: number },
    lastMsg: { id: number },
    allMessageIds: number[]
  ): SemanticChapter[] {
    const chapters: SemanticChapter[] = [];
    const chunkSize = 30;
    
    for (let i = 0; i < allMessageIds.length; i += chunkSize) {
      const chunk = allMessageIds.slice(i, i + chunkSize);
      if (chunk.length > 0) {
        chapters.push({
          title: `Часть ${chapters.length + 1}`,
          startMessageId: chunk[0],
          endMessageId: chunk[chunk.length - 1],
          messageIds: chunk
        });
      }
    }
    
    return chapters;
  }

  /**
   * Ручное сжатие выделенного диапазона сообщений
   */
  async compressSelectedRange(
    chatId: number,
    userId: number,
    startMessageId: number,
    endMessageId: number
  ): Promise<ChatBlock> {
    // 1. Получаем все сообщения чата
    const chatWithMessages = chatRepository.getChatWithMessages(chatId);
    if (!chatWithMessages || !chatWithMessages.messages) {
      throw new Error('Chat not found or no messages');
    }

    // 2. Фильтруем сообщения в диапазоне
    const messages = chatWithMessages.messages.filter(
      msg => msg.id >= startMessageId && msg.id <= endMessageId
    );

    if (messages.length === 0) {
      throw new Error('No messages in selected range');
    }

    // 3. Получаем персонаж
    const character = characterRepository.getCharacterById(chatWithMessages.character_id);
    if (!character) {
      throw new Error('Character not found');
    }

    // 4. Получаем профиль героя
    const heroProfile = heroVariationRepository.getHeroProfileForLLM(userId);
    const activeHero = heroVariationRepository.getActiveHeroVariationByUserId(userId);
    const heroName = activeHero?.name || null;

    // 5. Генерируем summary для блока
    const block: SemanticBlock = {
      messages,
      startMessageId,
      endMessageId
    };

    const existingBlocks = chatBlockRepository.getBlocksByChatId(chatId);
    const previousSummaries = existingBlocks.map(b => b.summary);

    const compressionBlock = await this.generateBlockSummary(
      block,
      previousSummaries,
      character,
      heroProfile,
      heroName,
      false,
      userId
    );

    // 6. Сохраняем блок
    const sortOrder = chatBlockRepository.getMaxSortOrder(chatId);
    const params: CreateChatBlockParams = {
      chat_id: chatId,
      title: compressionBlock.title,
      summary: compressionBlock.summary,
      original_message_ids: compressionBlock.messageIds,
      start_message_id: compressionBlock.startMessageId,
      end_message_id: compressionBlock.endMessageId,
      sort_order: sortOrder + 1
    };
    const savedBlock = chatBlockRepository.createBlock(params);

    return savedBlock;
  }

  /**
   * Откат последнего сжатия (удаление последнего блока)
   */
  async undoLastCompression(chatId: number): Promise<boolean> {
    const lastBlock = chatBlockRepository.getLastBlock(chatId);
    if (!lastBlock) {
      return false;
    }
    return chatBlockRepository.deleteBlock(lastBlock.id);
  }

  /**
   * Проверка необходимости сжатия
   */
  async needsCompression(chatId: number, userId: number, threshold: number = 90): Promise<{ needsCompression: boolean; percentage: number }> {
    const { contextService } = await import('./context.service');
    const stats = await contextService.getChatContextStats(chatId, userId);
    const needsCompression = stats.percentage >= threshold;
    return { needsCompression, percentage: stats.percentage };
  }

  /**
   * Разбивка истории на семантические блоки
   */
  private splitIntoSemanticBlocks(messages: Message[], maxBlockMessages: number): SemanticBlock[] {
    const blocks: SemanticBlock[] = [];
    let currentBlockMessages: Message[] = [];
    let currentStartId: number | null = null;

    for (const msg of messages) {
      currentBlockMessages.push(msg);
      
      if (currentStartId === null) {
        currentStartId = msg.id;
      }

      // Если достигли лимита сообщений в блоке
      if (currentBlockMessages.length >= maxBlockMessages) {
        blocks.push({
          messages: [...currentBlockMessages],
          startMessageId: currentStartId,
          endMessageId: msg.id
        });
        currentBlockMessages = [];
        currentStartId = null;
      }
    }

    // Добавляем оставшиеся сообщения как последний блок
    if (currentBlockMessages.length > 0) {
      blocks.push({
        messages: [...currentBlockMessages],
        startMessageId: currentStartId!,
        endMessageId: currentBlockMessages[currentBlockMessages.length - 1].id
      });
    }

    return blocks;
  }

  /**
   * Генерация хэша для текста
   */
  private generateHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Генерация краткого пересказа для блока
   */
  private async generateBlockSummary(
    block: SemanticBlock,
    previousSummaries: string[],
    character: any,
    heroProfile: string | null,
    heroName: string | null,
    useTranslations: boolean = false,
    userId?: number
  ): Promise<CompressionBlock & { summaryTranslationHash?: string }> {
    // Формируем текст блока для суммаризации
    const blockText = block.messages.map(msg => {
      const role = msg.role === 'user' ? 'Пользователь' : 'Персонаж';
      const content = msg.translated_content || msg.content;
      return `${role}: ${content}`;
    }).join('\n');

    console.log('[CompressionService] >>> Block messages count:', block.messages.length);
    console.log('[CompressionService] >>> Block first message content preview:', (block.messages[0]?.content || '').substring(0, 100));
    console.log('[CompressionService] >>> Block text length:', blockText.length);
    console.log('[CompressionService] >>> Block text preview:', blockText.substring(0, 300));
    console.log('[CompressionService] >>> useTranslations:', useTranslations);

    // Формируем контекст предыдущих суммаризаций
    const previousContext = previousSummaries.length > 0
      ? `Предыдущие события:\n${previousSummaries.join('\n\n')}\n\n`
      : '';

    const languageHint = useTranslations
      ? 'Краткий пересказ и заголовок должны быть на русском языке.'
      : 'Краткий пересказ и заголовок должны быть на том же языке, что и оригинальные сообщения.';

    // Формируем пользовательские инструкции (из настроек)
    const userInstructions = userId ? await this.getCompressionSystemInstructions(userId) : this.DEFAULT_COMPRESSION_SYSTEM_INSTRUCTIONS;

    // Промпт для суммаризации — строгий формат без мыслей
    const prompt = `Ты — ассистент для сжатия истории диалога.

ВАЖНО: Ты НЕ ДОЛЖЕН писать рассуждения, анализ или мыслительный процесс.
Ты НЕ ДОЛЖЕН использовать слова "thinking", "analyze", "input", "task" и т.п.
Ты НЕ ДОЛЖЕН использовать нумерованные списки или маркированные пункты.
Ты НЕ ДОЛЖЕН писать "Here's a thinking process" или подобные фразы.

Ты должен вывести ТОЛЬКО две строки:
1. Строка ЗАГОЛОВОК:
2. Строка ПЕРЕСКАЗ:

${languageHint}

Ответь ТОЛЬКО в этом формате, ничего больше:
ЗАГОЛОВОК: <короткий заголовок до 10 слов>
ПЕРЕСКАЗ: <структурированный пересказ с тегами [Действия] [Диалоги] [Изменения] [Детали]>

${previousContext}Текущая часть истории:
${blockText}

---
ИНСТРУКЦИИ ПО ФОРМИРОВАНИЮ ПЕРЕСКАЗА:
${userInstructions}`;

    // Системное сообщение — жёсткие ограничения формата (не зависит от пользователя)
    const systemMessage = `Ты — ассистент для сжатия истории диалога. Твоя задача — отвечать ТОЛЬКО в формате:
ЗАГОЛОВОК: <текст>
ПЕРЕСКАЗ: <текст>

Строго запрещено:
- Писать рассуждения или мыслительный процесс
- Использовать слова "thinking", "analyze", "thought"
- Использовать нумерованные или маркированные списки
- Писать "Here's a thinking process" или подобные фразы
- Выводить что-либо кроме формата ЗАГОЛОВОК/ПЕРЕСКАЗ

Если ты не следуешь этому правилу, система сломается. Отвечай ТОЛЬКО в указанном формате.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: prompt }
    ];

    let summary = '';
    let title = 'Сжатая история';

    try {
      // Получаем конфигурацию LLM из активного соединения пользователя
      const llmConfig = this.getLlmConnectionConfig(userId);

      // Вызываем API с retry логикой при временных ошибках
      const response = await this.withCompressionRetry(
        async () => {
          const { LLMClient } = require('llm-client');
          const client = new LLMClient({
            baseURL: llmConfig.baseURL,
            apiKey: llmConfig.apiKey,
            timeout: 900000,
          });

          return await client.chatCompletionsCreate({
            model: llmConfig.model,
            messages,
            temperature: this.SUMMARY_TEMPERATURE,
            max_tokens: 2000,
          });
        },
        `generateBlockSummary block[${block.startMessageId}-${block.endMessageId}]`
      );

      const message = response.choices?.[0]?.message;
      const content = message?.content || '';
      const reasoningContent = message?.reasoning || message?.reasoning_content || '';
      
      console.log('[CompressionService] >>> content length:', content.length);
      console.log('[CompressionService] >>> reasoningContent length:', reasoningContent.length);
      console.log('[CompressionService] >>> message keys:', message ? Object.keys(message) : 'undefined');
      
      // Если content пустой, но есть reasoning — значит LLM с reasoning mode
      let finalContent = content;
      if (!content && reasoningContent) {
        console.log('[CompressionService] >>> content is empty, extracting from reasoning');
        finalContent = this.extractResponseFromReasoning(reasoningContent);
      }
      
      console.log('[CompressionService] >>> LLM finalContent preview:', finalContent.substring(0, 300));
      
      // Парсим ответ — пробуем формат ЗАГОЛОВОК/ПЕРЕСКАЗ
      let titleMatch = finalContent.match(/ЗАГОЛОВОК:\s*(.+?)(?:\n|$)/i);
      let summaryMatch = finalContent.match(/ПЕРЕСКАЗ:\s*([\s\S]+?)(?=\n\nПЕРЕСКАЗ:|\n\nЗАГОЛОВОК:|\n\n|$)/i);
      
      // Если не сработало, пробуем извлечь без префиксов
      if (!titleMatch && !summaryMatch) {
        console.log('[CompressionService] >>> Standard format failed, trying to extract content');
        
        // Убираем thinking-процесс из текста
        let cleanContent = finalContent;
        
        // Убираем "Here's a thinking process:" и всё что до реального ответа
        cleanContent = cleanContent.replace(/here['']s\s+(a\s+)?thinking\s+(process|analysis)?\s*:/gi, '');
        cleanContent = cleanContent.replace(/let['']s\s+(me\s+)?(think|analyze)/gi, '');
        
        // Убираем нумерованные пункты анализа (1. Analyze, 2. Identify и т.д.)
        cleanContent = cleanContent.replace(/^\d+\.\s+[\w\s]+?:\s*\n([\s\S]*?)(?=\n\d+\.\s|\n\n|$)/gms, '');
        
        // Убираем "- **Analyze User Input:**" и подобные строки
        cleanContent = cleanContent.replace(/^- \*\*[\w\s]+\*\*:\s*\n([\s\S]*?)(?=\n- \*\*|\n\n$)/gm, '');
        
        // Убираем "- Language:" строку
        cleanContent = cleanContent.replace(/^- \*\*Language\*\*:\s*[\w\s]+\n?/gi, '');
        
        // Убираем "- **Task:**" строку
        cleanContent = cleanContent.replace(/^- \*\*Task\*\*:\s*[\w\s:]+/gi, '');
        
        // Убираем "- **Content:**" строку
        cleanContent = cleanContent.replace(/^- \*\*Content\*\*:\s*[\w\s:]+/gi, '');
        
        // Убираем "- **Summary length:**" строку
        cleanContent = cleanContent.replace(/^- \*\*Summary length\*\*:\s*[\w\s:]+/gi, '');
        
        // Убираем "- **Title length:**" строку
        cleanContent = cleanContent.replace(/^- \*\*Title length\*\*:\s*[\w\s:]+/gi, '');
        
        // Убираем "- **Input Text:**" и всё до следующего пустого конца
        cleanContent = cleanContent.replace(/^- \*\*Input Text\*\*:\s*[\s\S]*?(?=\n\n)/g, '');
        
        // Убираем "- **Current Segment Events:**" и всё до следующего пустого конца
        cleanContent = cleanContent.replace(/^- \*\*Current Segment Events\*\*:\s*[\s\S]*?(?=\n\n)/g, '');
        
        // Убираем "- **Key Events:**" и всё до следующего пустого конца
        cleanContent = cleanContent.replace(/^- \*\*Key Events\*\*:\s*[\s\S]*?(?=\n\n)/g, '');
        
        // Убираем "- **Context:**" и всё до следующего пустого конца
        cleanContent = cleanContent.replace(/^- \*\*Context\*\*:\s*[\s\S]*?(?=\n\n)/g, '');
        
        // Убираем "- **Role:**" и всё до следующего пустого конца
        cleanContent = cleanContent.replace(/^- \*\*Role\*\*:\s*[\s\S]*?(?=\n\n)/g, '');
        
        // Убираем "- **Task**" и всё до следующего пустого конца
        cleanContent = cleanContent.replace(/^- \*\*Task\*\*:\s*[\s\S]*?(?=\n\n)/g, '');
        
        // Убираем "- **Language:**" строку
        cleanContent = cleanContent.replace(/^- \*\*Language\*\*:\s*[\w\s]+\n?/g, '');
        
        // Убираем "- **Summary length:**" строку
        cleanContent = cleanContent.replace(/^- \*\*Summary length\*\*:\s*[\w\s:]+\n?/g, '');
        
        // Убираем "- **Title length:**" строку
        cleanContent = cleanContent.replace(/^- \*\*Title length\*\*:\s*[\w\s:]+\n?/g, '');
        
        // Убираем "- **Content:**" строку
        cleanContent = cleanContent.replace(/^- \*\*Content\*\*:\s*[\w\s:]+\n?/g, '');
        
        // Убираем пустые строки в начале
        cleanContent = cleanContent.replace(/^\n+/, '').trim();
        
        // Пробуем снова с очищенным текстом
        titleMatch = cleanContent.match(/ЗАГОЛОВОК:\s*(.+?)(?:\n|$)/i);
        summaryMatch = cleanContent.match(/ПЕРЕСКАЗ:\s*([\s\S]+?)(?=\n\nПЕРЕСКАЗ:|\n\nЗАГОЛОВОК:|\n\n|$)/i);
        
        if (!titleMatch && !summaryMatch) {
          console.log('[CompressionService] >>> Cleaned content:', cleanContent.substring(0, 400));
          
          // Если всё ещё не сработало — используем весь текст как summary
          if (cleanContent.length > 50) {
            console.log('[CompressionService] >>> Using entire cleaned content as summary');
            summary = cleanContent.substring(0, 1500);
            title = 'Сжатая история';
          }
        }
      }

      if (!titleMatch && !summaryMatch && !summary) {
        // Fallback: берем первые N символов как summary
        const cleanText = finalContent.replace(/here['']s\s+(a\s+)?thinking/gi, '').trim();
        if (cleanText.length > 50) {
          summary = cleanText.substring(0, 1000);
          title = 'Сжатая история';
          console.log('[CompressionService] >>> Using final fallback');
        }
      }

      if (titleMatch) {
        title = titleMatch[1].trim();
      }
      if (summaryMatch) {
        summary = summaryMatch[1].trim();
      }
      
      // Ограничиваем длину summary
      if (summary.length > 2000) {
        summary = summary.substring(0, 2000) + '...';
      }
      
      console.log('[CompressionService] >>> Final title:', title);
      console.log('[CompressionService] >>> Final summary length:', summary.length);
    } catch (error) {
      console.error('[CompressionService] Error generating block summary:', error);
      
      // Fallback: генерируем простой заголовок и пересказ
      title = `Глава ${Date.now()}`;
      summary = `Сжатая история: ${block.messages.length} сообщений. ${block.messages.slice(0, 3).map(m => (m.content || '').substring(0, 50)).join(' ... ')}`;
    }

    // Перевод summary на английский (если включён в настройках)
    let translationHash: string | undefined = undefined;
    if (useTranslations && summary.length > 0) {
      try {
        console.log('[TranslationService] translateToEnglish: START -', summary.substring(0, 100));
        const translationResult = await translationService.translate(summary, { targetLang: 'en' });
        if (translationResult) {
          console.log('[TranslationService] translateToEnglish: SUCCESS -', (translationResult.translatedText || '').substring(0, 100));
          // Сохраняем перевод в summary_translation
          summary = summary + '\n[EN]' + (translationResult.translatedText || summary);
          translationHash = this.generateHash(summary);
        }
      } catch (error) {
        console.error('[CompressionService] Error translating summary:', error);
      }
    }

    return {
      title,
      summary,
      summaryTranslationHash: translationHash,
      messageIds: block.messages.map(m => m.id),
      startMessageId: block.startMessageId,
      endMessageId: block.endMessageId
    };
  }

  /**
   * Оценка экономии токенов
   */
  private estimateTokenSavings(originalMessages: Message[], compressedBlocks: ChatBlock[]): number {
    // Примерная оценка: каждое сообщение ~50 токенов, summary ~100 токенов
    const originalTokenCount = originalMessages.length * 50;
    const compressedTokenCount = compressedBlocks.length * 100;
    return originalTokenCount - compressedTokenCount;
  }

  /**
   * Получение промпта для LLM с учётом сжатых блоков
   */
  async getPromptForContext(
    chatId: number,
    userId: number,
    useTranslations: boolean = true
  ): Promise<LLMMessage[]> {
    const chatWithMessages = chatRepository.getChatWithMessages(chatId);
    if (!chatWithMessages || !chatWithMessages.messages) {
      return [];
    }

    const messages = chatWithMessages.messages;
    const blocks = chatBlockRepository.getBlocksByChatId(chatId);

    if (blocks.length === 0) {
      return messages.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.translated_content || msg.content
      }));
    }

    // Формируем промпт с блоками
    const result: LLMMessage[] = [];

    for (const msg of messages) {
      const blockForMessage = blocks.find(b =>
        b.original_message_ids.includes(msg.id.toString())
      );

      if (blockForMessage) {
        continue;
      }

      result.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.translated_content || msg.content
      });
    }

    // Добавляем блоки в начало промпта
    for (const block of blocks) {
      const summary = useTranslations && block.summary_translation_hash
        ? await this.getTranslatedSummary(block.summary, block.summary_translation_hash)
        : block.summary;
      
      result.unshift({
        role: 'system',
        content: `=== ${block.title} ===\n${summary}`
      });
    }

    return result;
  }

  /**
   * Получение переведённого summary (кэшируется)
   */
  private async getTranslatedSummary(summary: string, hash: string): Promise<string> {
    try {
      const translationResult = await translationService.translate(summary, { targetLang: 'en' });
      return translationResult.translatedText || summary;
    } catch (error) {
      console.error('[CompressionService] Error translating summary:', error);
      return summary;
    }
  }
}

export const compressionService = new CompressionService();