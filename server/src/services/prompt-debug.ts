/**
 * Prompt Debug Service - Диагностика кэширования промптов для гибридных моделей
 * 
 * Отправляет промпт на /tokenize endpoint llama-server и логировать метаданные
 * для сравнения структуры промптов между запросами.
 * 
 * Критически важно для моделей с архитектурой qwen35moe (гибридные MoE),
 * которые требуют бит-в-бит идентичных промптов для восстановления KV-кэша.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { chatRepository } from '../repositories/chat.repository';
import { characterRepository } from '../repositories/character.repository';
import { heroVariationRepository } from '../repositories/hero.variation.repository';
import { systemPromptService } from './system-prompt.service';
import { llmService, LLMMessage } from './llm.service';
import { chatBlockRepository } from '../repositories/chat-block.repository';

// =============================================
// КОНФИГУРАЦИЯ
// =============================================

/**
 * Включить отладочное логирование промптов.
 * Установите ENABLE_PROMPT_DEBUG=true в .env для активации.
 */
const ENABLE_PROMPT_DEBUG = process.env.ENABLE_PROMPT_DEBUG === 'true';

/**
 * Путь к файлу журнала отладки промптов.
 */
const DEBUG_LOG_PATH = path.join('/tmp', 'hometavern_prompt_debug.log');

/**
 * Максимальная длина промпта для логирования (чтобы не засорять лог).
 */
const MAX_LOG_LENGTH = 2000;

// =============================================
// ТИПЫ ДАННЫХ
// =============================================

export interface PromptDebugInfo {
  /** Уникальный идентификатор запроса */
  requestId: string;
  /** Метка времени */
  timestamp: string;
  /** ID чата (если применимо) */
  chatId?: number;
  /** Длина промпта в символах */
  length: number;
  /** MD5 хеш первых 200 символов промпта (для быстрого сравнения) */
  hashPrefix: string;
  /** Полный MD5 хеш всего промпта */
  fullHash: string;
  /** Первые 10 токенов (если получены от llama-server) */
  firstTokens?: number[];
  /** Последние 10 токенов (если получены от llama-server) */
  lastTokens?: number[];
  /** Количество токенов (если получено от llama-server) */
  tokenCount?: number;
  /** Детализация по частям промпта */
  parts?: PromptPartsAnalysis;
  /** Флаг: совпадает ли с предыдущим запросом в том же чате (null = первый запрос, undefined = отладка отключена) */
  matchesPrevious?: boolean | null;
  /** Ошибка (если произошла) */
  error?: string;
}

interface PromptPartsAnalysis {
  systemPromptLength: number;
  characterProfileLength: number;
  heroProfileLength: number;
  historyMessageCount: number;
  currentMessageLength: number;
  totalContentLength: number;
}

// =============================================
// СЕССИОННЫЙ КАШЬ ХЕШЕЙ
// =============================================

/**
 * Кэш хешей промптов по chatId для сравнения между запросами.
 * Используется для быстрого определения, изменился ли промпт
 * без обращения к llama-server.
 */
const promptHashCache = new Map<number, { hash: string; timestamp: string }>();

/**
 * Сбросить кэш хешей для конкретного чата.
 * Вызывается при изменении системного промпта, профиля, сжатия.
 */
export function resetPromptHashCache(chatId: number): void {
  promptHashCache.delete(chatId);
  if (ENABLE_PROMPT_DEBUG) {
    console.log(`[PromptDebug] 🔓 Cache reset for chat ${chatId}`);
  }
}

/**
 * Сбросить весь кэш хешей.
 */
export function resetAllPromptHashCache(): void {
  promptHashCache.clear();
  if (ENABLE_PROMPT_DEBUG) {
    console.log('[PromptDebug] 🔓 All prompt hash cache cleared');
  }
}

// =============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =============================================

/**
 * Генерирует уникальный ID запроса. */
function generateRequestId(): string {
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Вычисляет MD5 хеш строки.
 */
function computeHash(content: string, maxLength: number = 200): string {
  const truncated = content.substring(0, maxLength);
  return crypto.createHash('md5').update(truncated).digest('hex');
}

/**
 * Вычисляет полный MD5 хеш всей строки. */
function computeFullHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Форматирует массив токенов для логирования.
 */
function formatTokens(tokens: number[]): string {
  return '[' + tokens.join(', ') + ']';
}

/**
 * Анализирует части промпта для детальной отладки.
 */
function analyzePromptParts(messages: LLMMessage[]): PromptPartsAnalysis | null {
  if (messages.length === 0) return null;

  const systemMsg = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role === 'user');
  
  const systemLength = systemMsg?.content.length ?? 0;
  // Последний пользовательский сообщение — это текущее сообщение
  const currentMessage = userMessages[userMessages.length - 1];
  const historyMessages = userMessages.slice(0, -1);
  const assistantMessages = messages.filter(m => m.role === 'assistant');

  let characterProfileLength = 0;
  let heroProfileLength = 0;

  if (systemMsg) {
    // Пытаемся оценить длину частей системного промпта
    const content = systemMsg.content;
    const charIndex = content.indexOf('Character:');
    if (charIndex > 0) {
      characterProfileLength = content.substring(charIndex).length;
    }
    const heroIndex = content.indexOf('Hero Profile:');
    if (heroIndex > 0) {
      heroProfileLength = content.substring(heroIndex).length;
    }
  }

  const historyContent = [...historyMessages, ...assistantMessages]
    .map(m => m.content)
    .join('\n');

  return {
    systemPromptLength: systemLength,
    characterProfileLength,
    heroProfileLength,
    historyMessageCount: historyMessages.length + assistantMessages.length,
    currentMessageLength: currentMessage?.content.length ?? 0,
    totalContentLength: messages.reduce((sum, m) => sum + m.content.length, 0),
  };
}

/**
 * Записывает строку в лог-файл.
 */
function appendToLogFile(line: string): void {
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, line + '\n');
  } catch (error) {
    // Не критично — если файл не доступен, продолжаем без него
    console.warn('[PromptDebug] Failed to write to log file:', error);
  }
}

/**
 * Отправляет промпт на tokenize endpoint llama-server.
 */
async function tokenizePrompt(
  baseURL: string,
  content: string
): Promise<{ tokens: number[]; count: number } | null> {
  try {
    const resp = await fetch(`${baseURL}/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(5000), // 5 секунд таймаут
    });

    if (!resp.ok) {
      return null;
    }

    const data = await resp.json() as { tokens?: number[] };
    const tokens = data.tokens || [];
    
    return {
      tokens,
      count: tokens.length,
    };
  } catch (error) {
    // Не критично — tokenize может не поддерживаться или быть недоступным
    console.debug('[PromptDebug] Tokenize request failed:', error);
    return null;
  }
}

// =============================================
// ОСНОВНОЙ ФУНКЦИОНАЛ
// =============================================

/**
 * Создаёт полный текстовый промпт из массива сообщений для хеширования.
 */
function buildPromptText(messages: LLMMessage[]): string {
  return messages.map(m => `<${m.role}>${m.content}`).join('\n');
}

/**
 * Главная функция диагностики — анализирует и логирует промпт перед отправкой на llama-server.
 * 
 * @param messages - Массив сообщений, который будет отправлен на llama-server
 * @param options - Дополнительные параметры
 * @returns PromptDebugInfo с метаданными (null если отладка отключена)
 */
export async function debugPrompt(
  messages: LLMMessage[],
  options: {
    chatId?: number;
    baseURL?: string;
    model?: string;
  } = {}
): Promise<PromptDebugInfo | null> {
  if (!ENABLE_PROMPT_DEBUG) {
    return null;
  }

  const requestId = generateRequestId();
  const timestamp = new Date().toISOString();
  const chatId = options.chatId;

  // Строим текстовое представление промпта для хеширования
  const promptText = buildPromptText(messages);
  const hashPrefix = computeHash(promptText);
  const fullHash = computeFullHash(promptText);

  // Анализ частей промпта
  const parts = analyzePromptParts(messages);

  // Сравнение с предыдущим хешем чата (быстрая проверка без обращения к серверу)
  let matchesPrevious: boolean | null = null;
  if (chatId && promptHashCache.has(chatId)) {
    const cached = promptHashCache.get(chatId)!;
    matchesPrevious = fullHash === cached.hash;
    
    if (matchesPrevious) {
      console.log(`[PromptDebug] [${requestId}] ✅ Prompt UNCHANGED for chat ${chatId} — cache SHOULD hit`);
    } else {
      console.warn(`[PromptDebug] [${requestId}] ❌ Prompt CHANGED for chat ${chatId}: ${cached.hash.slice(0, 12)} → ${fullHash.slice(0, 12)}`);
      if (parts) {
        console.warn(`[PromptDebug]   system=${parts.systemPromptLength}, charProfile=${parts.characterProfileLength}, heroProfile=${parts.heroProfileLength}, history=${parts.historyMessageCount} msgs, current=${parts.currentMessageLength} chars`);
      }
    }
  } else if (chatId) {
    matchesPrevious = null; // Первый запрос для этого чата
    console.log(`[PromptDebug] [${requestId}] 🆕 First prompt for chat ${chatId}`);
  }

  // Сохраняем хеш в кэш
  if (chatId) {
    promptHashCache.set(chatId, { hash: fullHash, timestamp });
  }

  // Запрашиваем токенизацию от llama-server (асинхронно, не блокируя)
  const baseURL = options.baseURL || process.env.LLM_BASE_URL || 'http://localhost:1234/v1';
  tokenizePrompt(baseURL, promptText).then((result) => {
    if (result && result.tokens.length > 0) {
      const debugInfo: PromptDebugInfo = {
        requestId,
        timestamp,
        chatId,
        length: promptText.length,
        hashPrefix,
        fullHash,
        firstTokens: result.tokens.slice(0, 10),
        lastTokens: result.tokens.slice(-10),
        tokenCount: result.count,
        parts: parts || undefined,
        matchesPrevious: matchesPrevious || undefined,
      };

      // Лог в консоль (сжатый формат)
      const logLine = formatDebugInfo(debugInfo);
      console.log(`[PromptDebug] ${logLine}`);
      
      // Лог в файл
      appendToLogFile(logLine);
    }
  }).catch(() => {
    // Игнорируем ошибки токенизации — они не критичны для основной логики
  });

  // Возвращаем базовую информацию синхронно (токенизация придёт асинхронно)
  return {
    requestId,
    timestamp,
    chatId,
    length: promptText.length,
    hashPrefix,
    fullHash,
    parts: parts || undefined,
    matchesPrevious: matchesPrevious ?? undefined,
  };
}

/**
 * Форматирует PromptDebugInfo в строку для логирования.
 */
function formatDebugInfo(info: PromptDebugInfo): string {
  const chatIdStr = info.chatId ? `chat=${info.chatId}` : 'no-chat';
  const matchStr = info.matchesPrevious === true ? '✅' : info.matchesPrevious === false ? '❌' : '— ';
  
  let line = `[${info.timestamp}] ${matchStr} ${chatIdStr} | len=${info.length} | hash=${info.fullHash.slice(0, 16)}...`;
  
  if (info.tokenCount) {
    line += ` | tokens=${info.tokenCount}`;
  }
  
  if (info.parts) {
    line += ` | sys=${info.parts.systemPromptLength} char=${info.parts.characterProfileLength} hero=${info.parts.heroProfileLength} hist=${info.parts.historyMessageCount} cur=${info.parts.currentMessageLength}`;
  }

  if (info.firstTokens && info.firstTokens.length > 0) {
    line += ` | first=${formatTokens(info.firstTokens)}`;
  }

  return line;
}

/**
 * Логирование полной информации о промпте в файл (подробный формат).
 */
export function logDetailedPromptInfo(messages: LLMMessage[], chatId?: number): void {
  if (!ENABLE_PROMPT_DEBUG) return;

  const requestId = generateRequestId();
  const timestamp = new Date().toISOString();
  
  const promptText = buildPromptText(messages);
  const fullHash = computeFullHash(promptText);
  const parts = analyzePromptParts(messages);

  const logLines = [
    `══════════════════════════════════════════════════`,
    `PROMPT DEBUG INFO #${requestId}`,
    `Timestamp: ${timestamp}`,
    `Chat ID: ${chatId || 'N/A'}`,
    `Total messages: ${messages.length}`,
    `Prompt text length: ${promptText.length} chars`,
    `Full hash (MD5): ${fullHash}`,
  ];

  if (parts) {
    logLines.push(
      `  System prompt:     ${parts.systemPromptLength} chars`,
      `  Character profile: ${parts.characterProfileLength} chars`,
      `  Hero profile:      ${parts.heroProfileLength} chars`,
      `  History messages:  ${parts.historyMessageCount}`,
      `  Current message:   ${parts.currentMessageLength} chars`
    );
  }

  logLines.push(`Messages breakdown:`);
  for (const msg of messages) {
    const preview = msg.content.substring(0, Math.min(100, msg.content.length));
    logLines.push(`  [${msg.role}] (${msg.content.length} chars): "${preview}${msg.content.length > 100 ? '...' : ''}"`);
  }

  logLines.push(`══════════════════════════════════════════════════\n`);

  console.log(logLines.join('\n'));
  appendToLogFile(logLines.join('\n').substring(0, MAX_LOG_LENGTH * 3));
}

// =============================================
// ЭКСПОРТЫ
// =============================================

export default {
  // Основные функции
  debugPrompt,
  logDetailedPromptInfo,
  resetPromptHashCache,
  resetAllPromptHashCache,
  
  // Утилиты для тестирования
  computeHash,
  computeFullHash,
  buildPromptText,
  analyzePromptParts,
  
  // Конфигурация (для проверки)
  ENABLE_PROMPT_DEBUG,
  DEBUG_LOG_PATH,
  promptHashCache,
};