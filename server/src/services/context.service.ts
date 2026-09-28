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
import { llmConnectionRepository, LlmConnection } from '../repositories/llm-connection.repository';

// Типы для llama.cpp API
interface LlamaProps {
  default_generation_settings?: {
    n_ctx?: number;
    [key: string]: unknown;
  };
  // Разные сборки llama.cpp кладут n_ctx то в default_generation_settings,
  // то в корень ответа
  n_ctx?: number;
  total_n_ctx?: number;
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
  contextLimit: number;       // Максимальный контекст (0 = неизвестен)
  percentage: number;         // Процент использования (0-100)
  cached: boolean;            // Данные из кэша БД или с llama.cpp
  slotId: number | null;      // ID слота llama.cpp если найден
  lastSynced: string | null;  // Время последней синхронизации
  limitSource: ContextLimitSource; // Откуда взялся лимит
  limitNote: string;          // Короткая сводка для подсказки в UI
}

/**
 * Откуда известен размер контекста. Приоритет именно такой, каким его хочет
 * пользователь: указанное вручную значение важнее любого автоопределения.
 */
export type ContextLimitSource =
  | 'connection'   // заполнено поле context_length в подключении
  | 'llama.cpp'    // получено из /props сервера llama.cpp
  | 'tabbyapi'     // получено из /v1/model TabbyAPI
  | 'observed'     // оценка снизу вверх: израсходовано больше известного лимита
  | 'unknown';     // источник не найден

export interface ResolvedContextLimit {
  limit: number;                  // 0 = неизвестен
  source: ContextLimitSource;
  note: string;
}

/**
 * Ответ TabbyAPI на GET /v1/model.
 * Размер контекста прячется в нескольких местах, и какие из них заполнены,
 * зависит от версии TabbyAPI и от того, задан ли лимит в её конфиге.
 */
interface TabbyModelResponse {
  parameters?: {
    max_seq_len?: number;
    cache_size?: number;
    [key: string]: unknown;
  };
  meta?: {
    n_ctx?: number;
    n_ctx_train?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Вытаскивает размер контекста из ответа TabbyAPI /v1/model.
 *
 * max_seq_len  - верхняя граница длины последовательности из конфига TabbyAPI;
 * cache_size   - размер KV-кэша, то есть сколько токенов реально влезет (именно
 *                его указывает пользователь в конфиге);
 * meta.n_ctx   - фактический контекст загруженной модели;
 * meta.n_ctx_train - контекст обучения, последний довод.
 *
 * Из нескольких заполненных значений берётся НАИМЕНЬШЕЕ положительное: если
 * последовательность ограничена сильнее, чем размер кэша, ориентироваться нужно
 * на ограничение, иначе полоска снова будет врать.
 */
export function parseTabbyContextLimit(payload: TabbyModelResponse | null | undefined): { limit: number; field: string } {
  if (!payload || typeof payload !== 'object') return { limit: 0, field: '' };

  const candidates: Array<{ value: unknown; field: string }> = [
    { value: payload.parameters?.max_seq_len, field: 'parameters.max_seq_len' },
    { value: payload.parameters?.cache_size, field: 'parameters.cache_size' },
    { value: payload.meta?.n_ctx, field: 'meta.n_ctx' },
  ];

  let best = 0;
  let bestField = '';
  for (const candidate of candidates) {
    const value = Number(candidate.value);
    // 0, null и мусор означают «не задано», а не «ноль токенов»
    if (!Number.isFinite(value) || value <= 0) continue;
    if (best === 0 || value < best) {
      best = Math.floor(value);
      bestField = candidate.field;
    }
  }
  if (best > 0) return { limit: best, field: bestField };

  // Последний довод: контекст обучения. Он может быть больше рабочего окна,
  // но это всё равно честнее константы 16384.
  const trained = Number(payload.meta?.n_ctx_train);
  if (Number.isFinite(trained) && trained > 0) {
    return { limit: Math.floor(trained), field: 'meta.n_ctx_train' };
  }

  return { limit: 0, field: '' };
}

/**
 * Округляет вверх до ближайшего блока в 1024 токена - чтобы оценка «не меньше
 * израсходованного» выглядела как размер окна, а не как случайное число.
 */
function roundUpToContextChunk(tokens: number): number {
  return Math.max(1024, Math.ceil(tokens / 1024) * 1024);
}

export class ContextService {
  private limitCache: { key: string; resolved: ResolvedContextLimit; timestamp: number } | null = null;
  private readonly LIMIT_CACHE_TTL = 60000;         // успешное определение держим минуту
  private readonly LIMIT_CACHE_TTL_UNKNOWN = 15000; // неудачу держим коротко, чтобы не долбить эндпоинт

  constructor() {
    console.log('[ContextService] Initialized — reads LLM URL from active connection in DB');
  }

  /**
   * Активное подключение пользователя целиком.
   * Нужно не только ради URL: в том же подключении лежит поле context_length,
   * указанное пользователем, и ключ доступа к эндпоинту.
   */
  private getActiveConnection(userId: number): LlmConnection | null {
    try {
      const conn = llmConnectionRepository.getActiveByUserId(userId);
      if (!conn) {
        console.log(`[ContextService] No active connection found for user ${userId}`);
      }
      return conn;
    } catch (err) {
      console.error(`[ContextService] Error getting active connection for user ${userId}:`, err);
      return null;
    }
  }

  /**
   * Получение URL активного подключения пользователя из БД
   * Возвращает URL без /v1 суффикса (для /props, /slots, /tokenize)
   */
  private getActiveLlmBaseUrl(userId: number): string | null {
    const conn = this.getActiveConnection(userId);
    if (!conn) return null;
    // Убираем /v1 суффикс если есть (llama.cpp API на корневом уровне)
    const baseURL = conn.base_url.replace(/\/v1\/?$/, '');
    console.log(`[ContextService] Active connection for user ${userId}: ${baseURL}`);
    return baseURL;
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
   * Определяет размер контекста активного подключения.
   *
   * Порядок источников (первый успешный выигрывает):
   *   1. Поле context_length в подключении - то, что указал сам пользователь.
   *   2. GET /props у llama.cpp-совместимого сервера. Раньше этот шаг делался
   *      только для localhost, из-за чего любой внешний эндпоинт получал
   *      константу 16384 независимо от реальной модели.
   *   3. GET /v1/model у TabbyAPI.
   * Если не сработало ни одно - limit = 0, и UI обязан показать «неизвестно»,
   * а не выдуманное число.
   */
  async resolveContextLimit(userId: number): Promise<ResolvedContextLimit> {
    const conn = this.getActiveConnection(userId);
    if (!conn) {
      return { limit: 0, source: 'unknown', note: 'нет активного подключения' };
    }

    // Ручное значение важнее автоопределения и не требует запросов к эндпоинту
    const manual = Number(conn.context_length);
    if (Number.isFinite(manual) && manual > 0) {
      return { limit: Math.floor(manual), source: 'connection', note: 'указано в подключении' };
    }

    const rootURL = conn.base_url.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    // Ключ привязан к подключению и к значению его полей: правка подключения
    // сама сбрасывает кэш, отдельная инвалидация не нужна
    const cacheKey = `${conn.id}|${conn.base_url}|${conn.context_length ?? ''}`;
    const now = Date.now();

    if (this.limitCache && this.limitCache.key === cacheKey) {
      const ttl = this.limitCache.resolved.source === 'unknown'
        ? this.LIMIT_CACHE_TTL_UNKNOWN
        : this.LIMIT_CACHE_TTL;
      if (now - this.limitCache.timestamp < ttl) {
        return this.limitCache.resolved;
      }
    }

    const apiKey = this.getApiKey(conn);

    const llamaCtx = await this.detectFromLlamaCpp(rootURL, apiKey);
    if (llamaCtx > 0) {
      return this.cacheLimit(cacheKey, { limit: llamaCtx, source: 'llama.cpp', note: 'llama.cpp /props' }, now);
    }

    const tabby = await this.detectFromTabby(rootURL, apiKey);
    if (tabby.limit > 0) {
      return this.cacheLimit(cacheKey, {
        limit: tabby.limit,
        source: 'tabbyapi',
        note: `TabbyAPI /v1/model: ${tabby.field}`,
      }, now);
    }

    return this.cacheLimit(cacheKey, {
      limit: 0,
      source: 'unknown',
      note: 'эндпоинт не сообщает размер контекста',
    }, now);
  }

  private cacheLimit(key: string, resolved: ResolvedContextLimit, timestamp: number): ResolvedContextLimit {
    this.limitCache = { key, resolved, timestamp };
    console.log(`[ContextService] Context limit for ${key}: ${resolved.limit || 'unknown'} (${resolved.source})`);
    return resolved;
  }

  /** Ключ доступа к эндпоинту, если он задан в подключении */
  private getApiKey(conn: LlmConnection): string {
    if (!conn.api_key_encrypted) return '';
    try {
      return Buffer.from(conn.api_key_encrypted, 'base64').toString('utf-8');
    } catch {
      return '';
    }
  }

  /**
   * Запрос /props к llama.cpp-совместимому серверу на ЛЮБОМ хосте.
   */
  private async detectFromLlamaCpp(rootURL: string, apiKey: string): Promise<number> {
    const payload = await this.fetchJsonSafe<LlamaProps>(`${rootURL}/props`, apiKey);
    if (!payload) return 0;

    const candidates = [payload.default_generation_settings?.n_ctx, payload.total_n_ctx, payload.n_ctx];
    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value) && value > 0) return Math.floor(value);
    }
    return 0;
  }

  /**
   * Запрос /v1/model к TabbyAPI: у неё нет /props, но этот эндпоинт отдаёт
   * параметры запущенной модели, включая размер KV-кэша.
   */
  private async detectFromTabby(rootURL: string, apiKey: string): Promise<{ limit: number; field: string }> {
    const payload = await this.fetchJsonSafe<TabbyModelResponse>(`${rootURL}/v1/model`, apiKey);
    return parseTabbyContextLimit(payload);
  }

  /**
   * GET с разбором JSON. null при любой неудаче (эндпоинта нет, не тот формат,
   * хост недоступен) - для автоопределения это штатная ситуация, а не ошибка.
   */
  private async fetchJsonSafe<T>(url: string, apiKey: string): Promise<T | null> {
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      const response = await fetch(url, { method: 'GET', headers });
      if (!response.ok) {
        console.log(`[ContextService] ${url} -> HTTP ${response.status}, источник не подходит`);
        return null;
      }
      return await response.json() as T;
    } catch (error) {
      console.log(`[ContextService] ${url} недоступен:`, (error as Error).message);
      return null;
    }
  }

  /**
   * Совместимость: роут /api/context/props ожидает число. При неизвестном
   * лимите возвращает прежнее значение по умолчанию, чтобы существующие
   * потребители не получили ноль.
   */
  async getMaxContext(userId: number): Promise<number> {
    const resolved = await this.resolveContextLimit(userId);
    return resolved.limit > 0 ? resolved.limit : 16384;
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

      const resolvedLimit = await this.resolveContextLimit(userId);
      let maxContext = resolvedLimit.limit;
      let limitSource: ContextLimitSource = resolvedLimit.source;
      let limitNote: string = resolvedLimit.note;
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

      // Пол правды: лимит не должен быть меньше того, что уже израсходовано.
      // Если эндпоинт отдал больше, чем «известный» контекст, значит известный
      // лимит неверен или не найден - показываем округлённый вверх факт и честно
      // помечаем его как оценку, а не как точное окно модели.
      if (tokensUsed > maxContext) {
        const claimed = maxContext > 0 ? `, эндпоинт заявлял ${maxContext}` : '';
        maxContext = roundUpToContextChunk(tokensUsed);
        limitSource = 'observed';
        limitNote = `не меньше израсходованного (оценка)${claimed}`;
      }

      const percentage = maxContext > 0 ? (tokensUsed / maxContext) * 100 : 0;

      console.log(`[ContextService] Final stats for chat ${chatId}: ${tokensUsed}/${maxContext} tokens (${percentage.toFixed(1)}%) [limit: ${limitSource}] ${isCached ? '[cached]' : '[live]'} ${isLocal ? '[local]' : '[remote]'}`);

      return {
        tokensUsed,
        contextLimit: maxContext,
        percentage,
        cached: isCached,
        slotId,
        limitSource,
        limitNote,
        lastSynced: isCached ? contextRepository.getCachedStats(chatId)?.context_last_synced ?? null : new Date().toISOString(),
      };
    } catch (error) {
      console.error(`[ContextService] Error getting context stats for chat ${chatId}:`, error);

      // Полный fallback: попробуем кэш из БД
      try {
        const fallbackLimit = await this.resolveContextLimit(userId);
        let maxContext = fallbackLimit.limit;
        let limitSource: ContextLimitSource = fallbackLimit.source;
        let limitNote = fallbackLimit.note;

        const cached = contextRepository.getCachedStats(chatId);
        if (cached && cached.context_tokens_used > 0) {
          const used = cached.context_tokens_used;
          if (used > maxContext) {
            maxContext = roundUpToContextChunk(used);
            limitSource = 'observed';
            limitNote = 'не меньше израсходованного (оценка)';
          }
          const percentage = maxContext > 0 ? (used / maxContext) * 100 : 0;
          return {
            tokensUsed: used,
            contextLimit: maxContext,
            percentage,
            cached: true,
            slotId: null,
            limitSource,
            limitNote,
            lastSynced: cached.context_last_synced,
          };
        }

        return {
          tokensUsed: 0,
          contextLimit: maxContext,
          percentage: 0,
          cached: false,
          slotId: null,
          limitSource,
          limitNote,
          lastSynced: null,
        };
      } catch (err) {
        // ignore
      }

      return {
        tokensUsed: 0,
        contextLimit: 0,
        percentage: 0,
        cached: false,
        slotId: null,
        limitSource: 'unknown',
        limitNote: 'не удалось определить лимит',
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