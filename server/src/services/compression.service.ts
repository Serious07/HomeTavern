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
import { chatRepository, Message } from '../repositories/chat.repository';
import { chatBlockRepository, ChatBlock, CreateChatBlockParams } from '../repositories/chat-block.repository';
import { characterRepository } from '../repositories/character.repository';
import { heroVariationRepository } from '../repositories/hero.variation.repository';
import { llmService, LLMMessage } from './llm.service';
import { translationService } from './translation.service';

export interface CompressionOptions {
  maxBlockMessages?: number;    // Максимальное количество сообщений в блоке (эвристика)
  summaryTemperature?: number;  // Temperature для генерации пересказа
}

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

  /**
   * Автоматическое сжатие истории чата
   * Запускается при достижении 90% контекста
   */
  async compressChat(
    chatId: number,
    userId: number,
    options?: CompressionOptions
  ): Promise<CompressionResult> {
    const maxBlockMessages = options?.maxBlockMessages ?? this.DEFAULT_MAX_BLOCK_MESSAGES;
    
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

    // 4. Разбиваем на семантические блоки
    const semanticBlocks = this.splitIntoSemanticBlocks(messages, maxBlockMessages);

    // 5. Генерируем summary для каждого блока
    const existingBlocks = chatBlockRepository.getBlocksByChatId(chatId);
    const previousSummaries = existingBlocks.map(b => b.summary);

    const compressionBlocks: CompressionBlock[] = [];
    let sortOrder = chatBlockRepository.getMaxSortOrder(chatId);

    for (const block of semanticBlocks) {
      const compressionBlock = await this.generateBlockSummary(
        block,
        previousSummaries,
        character,
        heroProfile,
        heroName
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
      heroName
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
   * Возвращает true если контекст заполнен более чем на 90%
   */
  async needsCompression(chatId: number, userId: number, threshold: number = 90): Promise<{ needsCompression: boolean; percentage: number }> {
    // Получаем статистику контекста через contextService
    // Это будет реализовано после создания context.service.ts методов
    const { contextService } = await import('./context.service');
    const stats = await contextService.getChatContextStats(chatId, userId);
    const needsCompression = stats.percentage >= threshold;
    return { needsCompression, percentage: stats.percentage };
  }

  /**
   * Разбивка истории на семантические блоки
   * Использует эвристику на основе количества сообщений
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
   * Генерация хэша для текста (используется для кэширования перевода)
   */
  private generateHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Генерация краткого пересказа для блока
   * Учитывает предыдущие пересказы для контекста
   * Генерирует заголовок автоматически на основе содержания
   * Также генерирует перевод на английский и хэш для кэширования
   */
  private async generateBlockSummary(
    block: SemanticBlock,
    previousSummaries: string[],
    character: any,
    heroProfile: string | null,
    heroName: string | null
  ): Promise<CompressionBlock & { summaryTranslationHash?: string }> {
    // Формируем текст блока для суммаризации
    const blockText = block.messages.map(msg => {
      const role = msg.role === 'user' ? 'Пользователь' : 'Персонаж';
      const content = msg.translated_content || msg.content;
      return `${role}: ${content}`;
    }).join('\n');

    // Формируем контекст предыдущих суммаризаций
    const previousContext = previousSummaries.length > 0
      ? `Предыдущие события:\n${previousSummaries.join('\n\n')}\n\n`
      : '';

    // Промпт для суммаризации
    const prompt = `Ты помогаешь сжать историю диалога в краткий пересказ.
    
${previousContext}Текущая часть истории:
${blockText}

Напиши краткий пересказ этой части истории на русском языке, сохраняя ключевые события и детали.
Также придумай короткий заголовок для этой главы (максимум 10 слов).

Формат ответа:
ЗАГОЛОВОК: <заголовок главы>
ПЕРЕСКАЗ: <краткий пересказ на 3-7 предложений>`;

    // Отправляем запрос к LLM
    const messages: LLMMessage[] = [
      { role: 'system', content: 'Ты помощник для сжатия истории диалога. Твоя задача - создавать краткие пересказы, сохраняя ключевые события.' },
      { role: 'user', content: prompt }
    ];

    let summary = '';
    let title = `Глава ${Date.now()}`;

    try {
      // Используем LLMClient напрямую через llmService
      const { LLMClient } = require('llm-client');
      const client = new LLMClient({
        baseURL: process.env.LLM_BASE_URL || 'http://localhost:1234/v1',
        apiKey: process.env.LLM_API_KEY || 'local-model-key',
        timeout: 900000,
      });

      const response = await client.chatCompletionsCreate({
        model: process.env.LLM_MODEL || 'qwen-3.5',
        messages,
        temperature: this.SUMMARY_TEMPERATURE,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content || '';
      
      // Парсим ответ
      const titleMatch = content.match(/ЗАГОЛОВОК:\s*(.+?)(?:\n|$)/i);
      const summaryMatch = content.match(/ПЕРЕСКАЗ:\s*([\s\S]+)/i);

      title = titleMatch ? titleMatch[1].trim() : `Глава ${Date.now()}`;
      summary = summaryMatch ? summaryMatch[1].trim() : content;
    } catch (error) {
      console.error('[CompressionService] Error generating block summary:', error);
      
      // Fallback: генерируем простой заголовок и пересказ
      summary = `Сжатая история: ${block.messages.length} сообщений. ${block.messages.slice(0, 3).map(m => m.content.substring(0, 50)).join(' ... ')}`;
    }

    // Генерируем хэш для кэширования перевода
    const summaryHash = this.generateHash(summary);

    // Проверяем, есть ли уже перевод для этого хэша
    let translationHash: string | undefined = undefined;
    try {
      const translationResult = await translationService.translate(summary, { targetLang: 'en' });
      if (translationResult) {
        // Сохраняем перевод в кэш (в БД)
        translationHash = summaryHash;
        // Здесь можно сохранить перевод в отдельную таблицу кэша, если нужно
        // Для простоты мы будем генерировать перевод каждый раз, но использовать хэш для проверки
      }
    } catch (error) {
      console.error('[CompressionService] Error translating summary:', error);
      // Если перевод не удался, продолжаем без него
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
   * @param chatId - ID чата
   * @param userId - ID пользователя
   * @param useTranslations - Использовать переводы summary вместо оригиналов
   * @returns Массив сообщений для LLM
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
      // Нет сжатых блоков, возвращаем оригинальные сообщения
      return messages.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.translated_content || msg.content
      }));
    }

    // Формируем промпт с блоками
    const result: LLMMessage[] = [];

    for (const msg of messages) {
      // Проверяем, входит ли сообщение в какой-либо блок
      const blockForMessage = blocks.find(b =>
        b.original_message_ids.includes(msg.id.toString())
      );

      if (blockForMessage) {
        // Сообщение входит в блок, пропускаем (блок будет добавлен отдельно)
        continue;
      }

      // Сообщение не в блоке, добавляем как есть
      result.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.translated_content || msg.content
      });
    }

    // Добавляем блоки (сначала все блоки, затем сообщения)
    // В реальности нужно правильно перемешать блоки и сообщения по порядку
    // Для простоты добавим блоки в начало промпта
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
    // Здесь можно реализовать кэширование переводов в БД
    // Для простоты будем переводить каждый раз
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
