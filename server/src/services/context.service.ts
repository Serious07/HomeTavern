/**
 * Context Service - Интеграция с llama.cpp сервером для получения информации о контексте
 * 
 * Эндпоинты llama.cpp:
 * - GET /props - Общие настройки сервера (n_ctx)
 * - GET /slots - Состояние слотов (n_ctx, n_decoded для каждого слота)
 * - GET /tokenize - Токенизация текста через модель
 * 
 * URL сервера берётся из активного подключения пользователя в БД (llm_connections),
 * а не из .env — это позволяет использовать разные подключения для разных пользователей.
 */

import { contextRepository } from '../repositories/context.repository';
import { chatRepository } from '../repositories/chat.repository';
import { characterRepository } from '../repositories/character.repository';
import { heroVariationRepository } from '../repositories/hero.variation.repository';
import { formatMessagesForQwen, formatMessagesForQwenWithCompression, replaceUserPlaceholders } from './llm.service';
import { chatBlockRepository } from '../repositories/chat-block.repository';
import { llmConnectionRepository } from '../repositories/llm-connection.repository';

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
  private propsCache: { n_ctx: number; timestamp: number; baseURL: string } | null = null;
  private readonly PROPS_CACHE_TTL = 60000; // 1 минута кэширование для /props

  constructor() {
    console.log('[ContextService] Initialized — reads LLM URL from active connection in DB');
  }

  /**
   * Получение URL активного подключения пользователя из БД
   * Возвращает URL без /v1 суффикса (для /props, /slots, /tokenize)
   */
  private getActiveLlmBaseUrl(userId: number): string | null {
    try {
      const conn = llmConnectionRepository.getActiveByUserId(userId);
      if (!conn) {
        console.log(`[ContextService] No active connection found for user ${userId}`);
        return null;
      }
      // Убираем /v1 суффикс если есть (llama.cpp API на корневом уровне)
      const baseURL = conn.base_url.replace(/\/v1\/?$/, '');
      console.log(`[ContextService] Active connection for user ${userId}: ${baseURL}`);
      return baseURL;
    } catch (err) {
      console.error(`[ContextService] Error getting active connection for user ${userId}:`, err);
      return null;
    }
  }

  /**
   * Проверяет, является ли сервер локальным (127.0.0.1 или localhost)
   */
  private isLocalServer(baseURL: string): boolean {
    try {
      const url = new URL(baseURL);
      const hostname = url.hostname.toLowerCase();
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    } catch {
      return false;
    }
  }

  /**
   * Получение максимального контекста из /props
   * Использует кэширование для снижения нагрузки
   */
  async getMaxContext(userId: number): Promise<number> {
    const baseURL = this.getActiveLlmBaseUrl(userId);
    if (!baseURL) {
      return 16384; // Значение по умолчанию если нет подключения
    }

    // Для удаленных серверов не обращаемся к llama.cpp API
    if (!this.isLocalServer(baseURL)) {
      return 16384;
    }

    const now = Date.now();

    // Проверяем кэш (только если тот же baseURL)
    if (this.propsCache && this.propsCache.baseURL === baseURL && (now - this.propsCache.timestamp) < this.PROPS_CACHE_TTL) {
      return this.propsCache.n_ctx;
    }

    try {
      const response = await fetch(`${baseURL}/props`, {
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
      this.propsCache = { n_ctx, timestamp: now, baseURL };
      return n_ctx;
    } catch (error) {
      console.error('[ContextService] Error fetching /props:', error);
      throw error;
    }
  }

  /**
   * Получение текущего использования контекста из /slots
   * Возвращает информацию о всех активных слотах
   */
  async getContextUsage(userId: number): Promise<LlamaSlot[]> {
    const baseURL = this.getActiveLlmBaseUrl(userId);
    if (!baseURL) {
      return [];
    }

    // Для удаленных серверов не обращаемся к llama.cpp API
    if (!this.isLocalServer(baseURL)) {
      return [];
    }

    try {
      const response = await fetch(`${baseURL}/slots`, {
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
   */
  private async tokenizeViaLlamaCpp(baseURL: string, text: string): Promise<number> {
    if (!text || text.length === 0) {
      return 0;
    }

    try {
      const response = await fetch(`${baseURL}/tokenize`, {
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
   */
  private async calculateTokensFromSlot(baseURL: string, slot: LlamaSlot, chatContext?: { promptText?: string }): Promise<number> {
    const nDecoded = slot.next_token?.[0]?.n_decoded ?? 0;
    const nRemain = slot.next_token?.[0]?.n_remain ?? 0;
    const nCtx = slot.n_ctx ?? 0;

    // Метод 1: n_ctx - n_remain — самый надёжный способ получить общее количество токенов
    if (nCtx > 0 && nRemain > 0 && nRemain < nCtx) {
      const tokensUsed = nCtx - nRemain;
      console.log(`[ContextService] Using n_ctx - n_remain method: ${nCtx} - ${nRemain} = ${tokensUsed}`);
      return tokensUsed;
    }

    // Метод 2: Точный подсчет через /tokenize + n_decoded
    if (chatContext?.promptText) {
      const promptTokens = await this.tokenizeViaLlamaCpp(baseURL, chatContext.promptText);
      const total = promptTokens + nDecoded;
      console.log(`[ContextService] Using tokenize method: ${promptTokens} (prompt) + ${nDecoded} (decoded) = ${total}`);
      return total;
    }

    // Метод 3: Fallback — только n_decoded
    console.log(`[ContextService] Fallback to n_decoded only: ${nDecoded}`);
    return nDecoded;
  }

  /**
   * Поиск активного слота для текущего чата
   * 
   * Доверяем данным слота ТОЛЬКО когда is_processing = true (идёт активная генерация).
   * Если is_processing = false, данные слота могут быть остатками от перевода
   * или других LLM-запросов, поэтому возвращаем null для использования tokenize fallback.
   */
  private findActiveSlot(slots: LlamaSlot[]): LlamaSlot | null {
    if (!slots || slots.length === 0) {
      console.log('[ContextService] No slots returned from llama.cpp');
      return null;
    }

    // Стратегия 1: Ищем слоты, которые активно используются (is_processing = true)
    const processingSlots = slots.filter(slot => slot.is_processing);
    if (processingSlots.length > 0) {
      console.log(`[ContextService] Found ${processingSlots.length} processing slot(s)`);
      return processingSlots[0];
    }

    // Если нет активных слотов — возвращаем null.
    // getChatContextStats использует tokenize промпта чата вместо данных слота,
    // чтобы избежать учёта остатков от переводов и других LLM-запросов.
    console.log('[ContextService] No processing slots found, will use tokenize fallback');
    return null;
  }

  /**
   * Построение текста промпта для оценки количества токенов
   */
  private buildPromptTextForChat(chatId: number, userId: number): string {
    try {
      const chatWithMessages = chatRepository.getChatWithMessages(chatId);
      if (!chatWithMessages || !chatWithMessages.messages || chatWithMessages.messages.length === 0) {
        return '';
      }

      const character = characterRepository.getCharacterById(chatWithMessages.character_id);
      if (!character) {
        return '';
      }

      const heroProfile = heroVariationRepository.getHeroProfileForLLM(userId);
      const activeHero = heroVariationRepository.getActiveHeroVariationByUserId(userId);
      const heroName = activeHero?.name || null;

      const compressedBlocks = chatBlockRepository.getBlocksByChatId(chatId);

      const messages = compressedBlocks.length > 0
        ? formatMessagesForQwenWithCompression(
            userId,
            character,
            heroProfile,
            heroName,
            chatWithMessages.messages,
            '',
            compressedBlocks
          )
        : formatMessagesForQwen(
            userId,
            character,
            heroProfile,
            heroName,
            chatWithMessages.messages,
            ''
          );

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
   * Алгоритм (для локальных серверов):
   * 1. Получаем URL активного подключения из БД
   * 2. Если сервер локальный — получаем слоты из /slots
   * 3. Если слот занят — используем n_ctx - n_remain
   * 4. Если слот в idle — токенизируем промпт через /tokenize
   * 5. Сохраняем результат в БД для будущих запросов
   *
   * Для удаленных серверов: используем tokenize + кэш из БД
   */
  async getChatContextStats(chatId: number, userId: number, forceSync = false): Promise<ContextStats> {
    try {
      const baseURL = this.getActiveLlmBaseUrl(userId);
      const isLocal = baseURL ? this.isLocalServer(baseURL) : false;

      const maxContext = await this.getMaxContext(userId).catch(() => 16384);
      let tokensUsed: number | null = null;
      let slotId: number | null = null;
      let isCached = false;

      // Для локальных серверов: получаем данные из llama.cpp
      if (isLocal && baseURL) {
        const slots = await this.getContextUsage(userId).catch((err) => {
          console.error('[ContextService] Failed to get slots:', err);
          return null;
        });

        if (slots && slots.length > 0) {
          const promptText = this.buildPromptTextForChat(chatId, userId);
          const activeSlot = this.findActiveSlot(slots);

          if (activeSlot) {
            slotId = activeSlot.id;

            // Метод 1: n_ctx - n_remain (если слот занят — самый точный метод)
            const nDecoded = activeSlot.next_token?.[0]?.n_decoded ?? 0;
            const nRemain = activeSlot.next_token?.[0]?.n_remain ?? 0;
            const nCtx = activeSlot.n_ctx ?? 0;

            if (nCtx > 0 && nRemain > 0 && nRemain < nCtx) {
              tokensUsed = nCtx - nRemain;
              console.log(`[ContextService] Using n_ctx - n_remain: ${tokensUsed} tokens (slot ${slotId})`);
            } else if (promptText) {
              // Метод 2: Слот в idle — токенизируем промпт + n_decoded
              const promptTokens = await this.tokenizeViaLlamaCpp(baseURL, promptText);
              tokensUsed = promptTokens + nDecoded;
              console.log(`[ContextService] Using tokenize (slot idle): ${promptTokens} + ${nDecoded} = ${tokensUsed} tokens (slot ${slotId})`);
            } else if (nDecoded > 0) {
              // Метод 3: Только n_decoded (минимальный fallback)
              tokensUsed = nDecoded;
              console.log(`[ContextService] Using n_decoded only: ${tokensUsed} tokens (slot ${slotId})`);
            }
          }
        }
      }

      // Если не получили токены из слотов, пробуем оценить через tokenize
      if ((tokensUsed === null || tokensUsed === 0) && isLocal && baseURL) {
        const promptText = this.buildPromptTextForChat(chatId, userId);
        if (promptText) {
          const promptTokens = await this.tokenizeViaLlamaCpp(baseURL, promptText);
          if (promptTokens > 0) {
            tokensUsed = promptTokens;
            console.log(`[ContextService] Using standalone tokenize: ${tokensUsed} tokens`);
          }
        }
      }

      // Если всё ещё нет токенов, пробуем кэш из БД
      if (tokensUsed === null || tokensUsed === 0) {
        const cached = contextRepository.getCachedStats(chatId);
        if (cached && cached.context_tokens_used > 0) {
          tokensUsed = cached.context_tokens_used;
          isCached = true;
          console.log(`[ContextService] Using DB cache: ${tokensUsed} tokens`);
        }
      }

      // Если получили токены и они не из кэша — сохранить в БД
      if (tokensUsed !== null && tokensUsed > 0 && !isCached) {
        try {
          contextRepository.updateCachedStats(chatId, tokensUsed, new Date().toISOString());
        } catch (err) {
          console.error('[ContextService] Failed to update cache:', err);
        }
      }

      // Финальный fallback
      if (tokensUsed === null || tokensUsed === 0) {
        const cached = contextRepository.getCachedStats(chatId);
        if (cached && cached.context_tokens_used > 0) {
          tokensUsed = cached.context_tokens_used;
          isCached = true;
        } else {
          tokensUsed = 0;
        }
      }

      const percentage = maxContext > 0 ? (tokensUsed / maxContext) * 100 : 0;

      console.log(`[ContextService] Final stats for chat ${chatId}: ${tokensUsed}/${maxContext} tokens (${percentage.toFixed(1)}%) ${isCached ? '[cached]' : '[live]'} ${isLocal ? '[local]' : '[remote]'}`);

      return {
        tokensUsed,
        contextLimit: maxContext,
        percentage,
        cached: isCached,
        slotId,
        lastSynced: isCached ? contextRepository.getCachedStats(chatId)?.context_last_synced ?? null : new Date().toISOString(),
      };
    } catch (error) {
      console.error(`[ContextService] Error getting context stats for chat ${chatId}:`, error);

      // Полный fallback: попробуем кэш из БД
      try {
        const maxContext = await this.getMaxContext(userId).catch(() => 16384);
        const cached = contextRepository.getCachedStats(chatId);
        if (cached && cached.context_tokens_used > 0) {
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
      } catch (err) {
        // ignore
      }

      return {
        tokensUsed: 0,
        contextLimit: 16384,
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
  async getActiveSlots(userId: number) {
    const slots = await this.getContextUsage(userId);
    return slots.filter(slot => slot.is_processing || (slot.next_token?.[0]?.n_decoded || 0) > 0);
  }
}

export const contextService = new ContextService();