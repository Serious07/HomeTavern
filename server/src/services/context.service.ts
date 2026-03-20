/**
 * Context Service - Интеграция с llama.cpp сервером для получения информации о контексте
 * 
 * Эндпоинты llama.cpp:
 * - GET /props - Общие настройки сервера (n_ctx)
 * - GET /slots - Состояние слотов (n_ctx, n_decoded для каждого слота)
 * - GET /metrics - Prometheus метрики (если включено)
 */

import { contextRepository } from '../repositories/context.repository';
import { chatRepository } from '../repositories/chat.repository';
import { characterRepository } from '../repositories/character.repository';
import { heroVariationRepository } from '../repositories/hero.variation.repository';
import { formatMessagesForQwen, formatMessagesForQwenWithCompression, replaceUserPlaceholders } from './llm.service';
import { chatBlockRepository } from '../repositories/chat-block.repository';

// Типы для llama.cpp API
interface LlamaProps {
  default_generation_settings: {
    n_ctx: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface LlamaSlotNextToken {
  has_next_token: boolean;
  has_new_line: boolean;
  n_remain: number;
  n_decoded: number;   // Количество сгенерированных токенов
  [key: string]: unknown;
}

interface LlamaSlot {
  id: number;
  n_ctx: number;       // Лимит контекста для этого слота
  speculative: boolean;
  is_processing: boolean;
  id_task: number;
  n_tokens?: number;   // Фактическое количество токенов в контексте (из llama.cpp)
  n_past?: number;     // Альтернативное поле для количества токенов
  next_token: LlamaSlotNextToken[];
  [key: string]: unknown;
}

interface LlamaSlotsResponse {
  slots: LlamaSlot[];
  [key: string]: unknown;
}

export interface ContextStats {
  tokensUsed: number;         // Сколько токенов использовано
  contextLimit: number;       // Максимальный контекст
  percentage: number;         // Процент использования (0-100)
  cached: boolean;            // Данные из кэша БД или с llama.cpp
  slotId: number | null;      // ID слота llama.cpp если найден
  lastSynced: string | null;  // Время последней синхронизации
}

export class ContextService {
  private baseURL: string;
  private propsCache: { n_ctx: number; timestamp: number } | null = null;
  private readonly PROPS_CACHE_TTL = 60000; // 1 минута кэширование для /props

  constructor() {
    // URL llama.cpp сервера (без /v1, так как /props и /health на уровне сервера)
    this.baseURL = process.env.LLM_BASE_URL?.replace(/\/v1\/?$/, '') || 'http://localhost:8080';
    console.log('[ContextService] LLM base URL:', this.baseURL);
  }

  /**
   * Получение максимального контекста из /props
   * Использует кэширование для снижения нагрузки
   */
  async getMaxContext(): Promise<number> {
    const now = Date.now();
    
    // Проверяем кэш
    if (this.propsCache && (now - this.propsCache.timestamp) < this.PROPS_CACHE_TTL) {
      return this.propsCache.n_ctx;
    }

    try {
      const response = await fetch(`${this.baseURL}/props`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch /props: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as LlamaProps;
      const n_ctx = data.default_generation_settings?.n_ctx;

      if (!n_ctx || typeof n_ctx !== 'number') {
        throw new Error('Invalid response from /props: n_ctx not found');
      }

      // Кэшируем результат
      this.propsCache = { n_ctx, timestamp: now };
      return n_ctx;
    } catch (error) {
      console.error('[ContextService] Error fetching /props:', error);
      throw error;
    }
  }

  /**
   * Получение текущего использования контекста из /slots
   * Возвращает информацию о всех активных слотах
   * 
   * В llama.cpp сервере эндпоинт /slots возвращает массив слотов с информацией:
   * - n_ctx: лимит контекста для слота
   * - next_token[].n_decoded: количество сгенерированных токенов
   * - next_token[].n_remain: количество оставшихся токенов
   * - is_processing: флаг обработки
   * 
   * Для вычисления использованных токенов используется формула:
   * tokensUsed = n_ctx - n_remain (если n_remain < n_ctx)
   * tokensUsed = n_decoded + prompt_tokens (если n_remain >= n_ctx)
   * 
   * В данной версии llama.cpp поле n_past недоступно, поэтому используем n_remain
   */
  async getContextUsage(): Promise<LlamaSlot[]> {
    try {
      const response = await fetch(`${this.baseURL}/slots`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch /slots: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as LlamaSlot[];
      return data || [];
    } catch (error) {
      console.error('[ContextService] Error fetching /slots:', error);
      throw error;
    }
  }

 /**
  * Точный подсчет токенов через эндпоинт /tokenize llama.cpp
  *
  * @param text - Текст для токенизации
  * @returns Количество токенов
  */
 private async tokenizeViaLlamaCpp(text: string): Promise<number> {
   if (!text || text.length === 0) {
     return 0;
   }

   try {
     const response = await fetch(`${this.baseURL}/tokenize`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ content: text }),
     });

     if (!response.ok) {
       throw new Error(`Failed to tokenize: ${response.status} ${response.statusText}`);
     }

     const data = await response.json() as { tokens: number[] | Array<{ id: number; piece: string }> };
     return Array.isArray(data.tokens) ? data.tokens.length : 0;
   } catch (error) {
     console.error('[ContextService] Error tokenizing via llama.cpp:', error);
     // Fallback на эвристику при ошибке
     return this.estimateTokensFromText(text);
   }
 }

 /**
    * Оценка количества токенов на основе размера текста (эвристика)
    *
    * Используем как fallback когда эндпоинт /tokenize недоступен
    * - Для английского текста: ~1 token ≈ 4 символа (среднее значение)
    * - Для русского/европейских языков: ~1 token ≈ 3.5 символа
    *
    * @param text - Текст для оценки (должен быть на английском)
    * @returns Примерное количество токенов
    */
 private estimateTokensFromText(text: string): number {
   if (!text || text.length === 0) {
     return 0;
   }
   
   // Эвристика: ~4 символа на токен для английского текста
   const charsPerToken = 4.0;
   return Math.max(1, Math.round(text.length / charsPerToken));
 }

 /**
   * Вычисление использованных токенов для слота на основе данных из /slots
   *
   * Поскольку llama.cpp не возвращает поле n_tokens, используем комбинацию:
   * 1. n_decoded (количество сгенерированных токенов ответа)
   * 2. Точный подсчет токенов промпта через /tokenize эндпоинт
   *
   * @param slot - Данные слота из llama.cpp
   * @param chatContext - Контекст чата с текстом промпта
   * @returns Вычисленное количество использованных токенов
   */
 private async calculateTokensFromSlot(slot: LlamaSlot, chatContext?: { promptText?: string }): Promise<number> {
   const nDecoded = slot.next_token?.[0]?.n_decoded ?? 0;

   // Если есть текст промпта, используем точный подсчет через /tokenize
   if (chatContext?.promptText) {
     const promptTokens = await this.tokenizeViaLlamaCpp(chatContext.promptText);
     return promptTokens + nDecoded;
   }

   // Fallback: используем только n_decoded (минимальная оценка)
   return nDecoded;
 }

  /**
   * Поиск активного слота для текущего чата
   * 
   * Поскольку llama.cpp не имеет прямой связи между слотом и chat_id,
   * мы ищем слоты, которые активно используются (is_processing или есть сгенерированные токены)
   * 
   * @param slots - Список всех слотов из llama.cpp
   * @returns Найденный активный слот или null
   */
  private findActiveSlot(slots: LlamaSlot[]): LlamaSlot | null {
    // Ищем слоты, которые активно используются
    const activeSlots = slots.filter(slot => 
      slot.is_processing || 
      (slot.next_token?.[0]?.n_decoded ?? 0) > 0 ||
      (slot.next_token?.[0]?.n_remain ?? slot.n_ctx) < slot.n_ctx
    );

    // Если есть активные слоты, возвращаем первый найденный
    // В будущем можно улучшить логику поиска по конкретному чату
    if (activeSlots.length > 0) {
      return activeSlots[0];
    }

    return null;
  }

 /**
   * Построение текста промпта для оценки количества токенов
   * Использует ТОЛЬКО тот же текст, который отправляется в LLM
   *
   * Это гарантирует, что оценка токенов соответствует реальному использованию контекста.
   * Использует ту же логику, что и formatMessagesForQwen в llm.service.ts
   * Учитывает сжатые блоки (chat_blocks) для точного подсчета токенов
   */
 private buildPromptTextForChat(chatId: number, userId: number): string {
    try {
      const chatWithMessages = chatRepository.getChatWithMessages(chatId);
      if (!chatWithMessages || !chatWithMessages.messages || chatWithMessages.messages.length === 0) {
        return '';
      }

      // Получаем персонаж
      const character = characterRepository.getCharacterById(chatWithMessages.character_id);
      if (!character) {
        return '';
      }

      // Получаем профиль героя (активная вариация)
      const heroProfile = heroVariationRepository.getHeroProfileForLLM(userId);
      const activeHero = heroVariationRepository.getActiveHeroVariationByUserId(userId);
      const heroName = activeHero?.name || null;

      // Получаем сжатые блоки
      const compressedBlocks = chatBlockRepository.getBlocksByChatId(chatId);

      // Используем ту же логику форматирования, что и в llm.service.ts
      const messages = compressedBlocks.length > 0
        ? formatMessagesForQwenWithCompression(
            character,
            heroProfile,
            heroName,
            chatWithMessages.messages,
            '', // currentMessage не нужен для оценки текущего контекста
            compressedBlocks
          )
        : formatMessagesForQwen(
            character,
            heroProfile,
            heroName,
            chatWithMessages.messages,
            '' // currentMessage не нужен для оценки текущего контекста
          );

      // Преобразуем сообщения в текстовый формат для оценки
      const textParts: string[] = [];
      
      for (const msg of messages) {
        const role = msg.role === 'system' ? 'System' : (msg.role === 'user' ? 'User' : 'Assistant');
        textParts.push(`${role}: ${msg.content}`);
      }

      return textParts.join('\n\n');
    } catch (error) {
      console.error(`[ContextService] Error building prompt text for chat ${chatId}:`, error);
      return '';
    }
  }

  /**
    * Получение статистики контекста для конкретного чата
    *
    * Алгоритм:
    * 1. Получаем данные из /slots llama.cpp для получения актуального использования контекста
    * 2. Получаем максимальный контекст из /props llama.cpp
    * 3. Строим текст промпта из истории сообщений для оценки токенов
    * 4. Вычисляем процент использования
    * 5. Если слоты недоступны, используем данные из БД как fallback
    *
    * Поскольку llama.cpp не возвращает точное количество токенов,
    * используем эвристику: оценка на основе размера текста промпта + n_decoded
    */
  async getChatContextStats(chatId: number, userId: number, forceSync = false): Promise<ContextStats> {
    try {
      // 1. Получаем актуальные данные из /slots llama.cpp
      const slots = await this.getContextUsage();
      const maxContext = await this.getMaxContext().catch(() => 16384);

      // 2. Строим текст промпта для оценки токенов
      const promptText = this.buildPromptTextForChat(chatId, userId);

      // 3. Ищем активный слот
      const activeSlot = this.findActiveSlot(slots);

      if (activeSlot) {
        // Вычисляем использованные токены из данных слота с учетом текста промпта (точный подсчет)
        const tokensUsed = await this.calculateTokensFromSlot(activeSlot, { promptText });
        const percentage = maxContext > 0 ? (tokensUsed / maxContext) * 100 : 0;

        console.log(`[ContextService] Slot-based stats for chat ${chatId}: ${tokensUsed} tokens (slot ${activeSlot.id}, prompt length: ${promptText.length} chars, prompt tokens via /tokenize)`);

        return {
          tokensUsed,
          contextLimit: maxContext,
          percentage,
          cached: false,
          slotId: activeSlot.id,
          lastSynced: new Date().toISOString(),
        };
      }

      // 3. Если нет активных слотов, используем данные из БД как fallback
      const cached = contextRepository.getCachedStats(chatId);
      if (cached) {
        console.log(`[ContextService] Using DB fallback for chat ${chatId}: ${cached.context_tokens_used} tokens`);
        const percentage = maxContext > 0 ? (cached.context_tokens_used / maxContext) * 100 : 0;
        return {
          tokensUsed: cached.context_tokens_used,
          contextLimit: maxContext,
          percentage,
          cached: true,
          slotId: null,
          lastSynced: cached.context_last_synced,
        };
      }

      // 4. Если нет данных ни из слотов, ни из БД, возвращаем нули
      console.log(`[ContextService] No stats available for chat ${chatId}`);
      return {
        tokensUsed: 0,
        contextLimit: maxContext,
        percentage: 0,
        cached: false,
        slotId: null,
        lastSynced: null,
      };
    } catch (error) {
      console.error(`[ContextService] Error getting context stats for chat ${chatId}:`, error);

      // Полностью fallback
      const maxContext = await this.getMaxContext().catch(() => 16384);
      return {
        tokensUsed: 0,
        contextLimit: maxContext,
        percentage: 0,
        cached: false,
        slotId: null,
        lastSynced: null,
      };
    }
  }

  /**
   * Принудительная синхронизация с llama.cpp
   */
  async forceSync(chatId: number, userId: number): Promise<ContextStats> {
    return this.getChatContextStats(chatId, userId, true);
  }

  /**
   * Получение списка всех активных слотов
   */
  async getActiveSlots() {
    const slots = await this.getContextUsage();
    return slots.filter(slot => slot.is_processing || (slot.next_token?.[0]?.n_decoded || 0) > 0);
  }
}

export const contextService = new ContextService();
