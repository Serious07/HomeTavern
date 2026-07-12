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
import db from '../config/database';
import { debugPrompt, resetPromptHashCache } from './prompt-debug';

// File system utilities for logging (using dynamic import to avoid ESM/CJS conflicts)
let fs: any = null;
let pathLib: any = null;

async function getFsUtils() {
  if (!fs) {
    fs = await import('fs').then(m => m.default || m);
    pathLib = await import('path').then(m => m.default || m);
  }
  return { fs, pathLib };
}

/**
 * Экранирует спецсимволы для безопасного использования в XML/HTML
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, String.fromCharCode(38) + 'amp;')
    .replace(/</g, String.fromCharCode(60) + 'lt;')
    .replace(/>/g, String.fromCharCode(62) + 'gt;')
    .replace(/"/g, String.fromCharCode(34) + 'quot;')
    .replace(/'/g, String.fromCharCode(39) + '#39;');
}

/**
 * Проверяет, включена ли генерация тегов подсветки диалогов для пользователя.
 * По умолчанию возвращает true (теги включены).
 */
function isDialogTaggingEnabled(userId: number): boolean {
  try {
    const setting = db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(userId, 'dialog_tagging_enabled');
    // По умолчанию true — если настройки нет, теги генерируются
    return setting?.value !== 'false';
  } catch {
    return true;
  }
}

/**
 * Оценивает количество токенов в тексте.
 * На основе данных из ошибки: 56266 токенов для 77923 символов = 1.385 символов на токен.
 * Добавляем запас ~20% на структуру сообщений, role tokens и separators.
 * Итого: 1 токен ≈ 1.17 символов (делим на 1.17 чтобы получить conservative оценку)
 */
function estimateTokenCount(text: string): number {
  if (!text || text.length === 0) return 0;
  const chars = text.length;
  // 1.385 символов на токен + 20% запас = делим на ~1.17
  return Math.ceil(chars / 1.17);
}

/**
 * Возвращает известный лимит контекста модели, если он задан.
 * Используется для cloud-провайдеров, где API валидирует сумму input + output.
 */
function getModelContextLimit(baseURL: string, model: string): number {
  const normalizedBaseURL = baseURL.toLowerCase();
  const normalizedModel = model.toLowerCase();

  // Silicon Flow / SiliconCloud: Nex-AGI Nex-N2-Pro advertises 262K context.
  if (normalizedBaseURL.includes('siliconflow') && normalizedModel.includes('nex-agi/nex-n2-pro')) {
    return 262144;
  }

  return 0;
}

/**
 * Вычисляет безопасный лимит output tokens для API, где max_tokens должен
 * укладываться вместе с input в общий context window.
 */
function calculateSafeMaxOutputTokens(params: {
  requestedMaxOutput: number;
  estimatedInputTokens: number;
  explicitContextLength: number;
  baseURL: string;
  model: string;
  reserveTokens: number;
}): number {
  const {
    requestedMaxOutput,
    estimatedInputTokens,
    explicitContextLength,
    baseURL,
    model,
    reserveTokens,
  } = params;

  if (!Number.isFinite(requestedMaxOutput) || requestedMaxOutput <= 0) {
    return requestedMaxOutput;
  }

  const contextLength = explicitContextLength > 0
    ? explicitContextLength
    : getModelContextLimit(baseURL, model);

  if (contextLength <= 0) {
    return requestedMaxOutput;
  }

  const maxOutputForContext = contextLength - estimatedInputTokens - reserveTokens;
  if (maxOutputForContext <= 0) {
    return 1;
  }

  return Math.min(requestedMaxOutput, maxOutputForContext);
}

/**
 * Обрезает историю сообщений, чтобы уложиться в лимит контекста.
 * Возвращает обрезанный массив сообщений, сохраняя самые последние.
 */
function truncateHistoryToFitContext(
  historyMessages: Message[],
  compressedBlocks: ChatBlock[] | null,
  systemContent: string,
  characterProfileContent: string,
  heroProfileContent: string | null,
  currentMessage: string,
  heroName: string | null,
  maxInputTokens: number
): { truncatedHistory: Message[], usedCompression: boolean } {
  
  // Создаем маппинг message_id -> block для быстрого поиска
  const messageToBlock = new Map<number, ChatBlock>();
  const compressedBlockSummaries: Array<{ msg: Message, block: ChatBlock }> = [];
  
  if (compressedBlocks) {
    for (const block of compressedBlocks) {
      const messageIds = JSON.parse(block.original_message_ids || '[]') as number[];
      messageIds.forEach(msgId => {
        messageToBlock.set(msgId, block);
      });
      // Находим первое сообщение блока для summary
      const firstMsgId = block.start_message_id;
      const firstMsg = historyMessages.find(m => m.id === firstMsgId);
      if (firstMsg) {
        compressedBlockSummaries.push({ msg: firstMsg, block });
      }
    }
  }

  // Функция оценки общего количества токенов
  function estimateTotalTokens(historyToUse: Message[]): number {
    let total = 0;
    // System prompt + formatting instruction + character profile
    total += estimateTokenCount(systemContent);
    total += estimateTokenCount(characterProfileContent);
    if (heroProfileContent) {
      total += estimateTokenCount(heroProfileContent);
    }
    // Current message
    total += estimateTokenCount(currentMessage);
    
    // History messages
    for (const msg of historyToUse) {
      if (msg.hidden) continue;
      const block = messageToBlock.get(msg.id);
      if (block && block.is_compressed === 1 && msg.id === block.start_message_id) {
        // Summary for compressed block
        const summary = `[Сжатая история: ${block.title}]\n${block.summary}`;
        total += estimateTokenCount(summary);
      } else if (!block || block.is_compressed !== 1) {
        const content = msg.role === 'user'
          ? (msg.translated_content || msg.content)
          : msg.content;
        total += estimateTokenCount(content);
      }
    }
    
    // Добавляем токены за структуру сообщений (role tokens, separators)
    // Примерно 4 токена на сообщение
    total += historyToUse.length * 4;
    
    return total;
  }

  // Если сжатие уже используется, проверяем, укладываемся ли мы
  const totalTokensWithCompression = estimateTotalTokens(historyMessages);
  if (totalTokensWithCompression <= maxInputTokens) {
    return { truncatedHistory: historyMessages, usedCompression: true };
  }

  // Если сжатие не используется, пробуем обрезать историю
  let effectiveHistory: Message[] = historyMessages;
  
  if (compressedBlocks && compressedBlocks.length > 0) {
    // Сжатие уже используется - удаляем несжатые сообщения из начала истории
    // Оставляем только последние N сообщений, которые помещаются в контекст
    let left = 0;
    let right = effectiveHistory.length;
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const testHistory = effectiveHistory.slice(mid);
      const tokens = estimateTotalTokens(testHistory);
      
      if (tokens <= maxInputTokens) {
        // Проверяем, можно ли добавить ещё
        if (mid > 0) {
          const testHistory2 = effectiveHistory.slice(mid - 1);
          const tokens2 = estimateTotalTokens(testHistory2);
          if (tokens2 <= maxInputTokens) {
            left = mid;
          } else {
            right = mid;
            break;
          }
        } else {
          break;
        }
      } else {
        left = mid + 1;
      }
    }
    
    // Находим минимальный срез, который укладывается
    for (let i = 0; i < effectiveHistory.length; i++) {
      const testHistory = effectiveHistory.slice(i);
      const tokens = estimateTotalTokens(testHistory);
      if (tokens <= maxInputTokens) {
        effectiveHistory = testHistory;
        // Пробуем добавить ещё одно сообщение
        if (i > 0) {
          const testHistory2 = effectiveHistory.slice(-effectiveHistory.length - 1);
          const tokens2 = estimateTotalTokens(testHistory2);
          if (tokens2 <= maxInputTokens) {
            effectiveHistory = historyMessages.slice(i - 1);
          }
        }
        break;
      }
    }
  } else {
    // Сжатие не используется - нужно предложить сжатие
    // Возвращаем пустую историю, чтобы клиент предложил сжатие
    return { truncatedHistory: [], usedCompression: false };
  }

  const finalTokens = estimateTotalTokens(effectiveHistory);
  console.log(`[LLMService] History truncated: ${historyMessages.length} -> ${effectiveHistory.length} messages (${finalTokens} tokens)`);
  
  return { truncatedHistory: effectiveHistory, usedCompression: true };
}

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

/**
 * Context object passed through the stream to communicate timing back to caller.
 * firstTokenTime is set when the first token (reasoning or content) is received,
 * so that speed calculation excludes preprocessing time.
 */
export interface StreamTimingContext {
  firstTokenTime: number;
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

  // Добавляем инструкцию по форматированию текста (если включена настройка)
  if (isDialogTaggingEnabled(userId)) {
    systemParts.push(LLM_FORMATTING_INSTRUCTION.trim());
  }

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
    let contentForLLM = msg.role === 'user'
      ? (msg.translated_content || msg.content)  // Если есть перевод, используем его
      : msg.content;  // Для assistant используем оригинал (уже на английском)
    
    // Заменяем плейсхолдеры {{User}}, {user} и т.д. на реальное имя героя
    contentForLLM = replaceUserPlaceholders(contentForLLM, heroName);
    
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
   * historyMessages уже обрезана снаружи
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

    // Добавляем инструкцию по форматированию текста (если включена настройка)
    if (isDialogTaggingEnabled(userId)) {
      systemParts.push(LLM_FORMATTING_INSTRUCTION.trim());
    }

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
        // ВАЖНО: summary оборачивается в XML-теги, чтобы LLM могла чётко отличить
        // сжатый блок от реального сообщения в истории
        if (msg.id === block.start_message_id) {
          const summaryText = block.summary_translation || block.summary;
          const titleText = block.title_translation || block.title;
          messages.push({
            role: 'user',
            content: `<compressed_history_block>\n<block_title>${escapeXml(titleText)}</block_title>\n<block_summary>${escapeXml(summaryText)}</block_summary>\n<original_message_count>${JSON.parse(block.original_message_ids || '[]').length} messages compressed</original_message_count>\n</compressed_history_block>`
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
      let contentForLLM = msg.role === 'user'
        ? (msg.translated_content || msg.content)  // Если есть перевод, используем его
        : msg.content;  // Для assistant используем оригинал (уже на английском)
      
      // Заменяем плейсхолдеры {{User}}, {user} и т.д. на реальное имя героя
      contentForLLM = replaceUserPlaceholders(contentForLLM, heroName);
      
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
  /** Enable reasoning/thinking mode for llama.cpp (chat_template_kwargs.enable_thinking) */
  private reasoning: boolean = true;
  private client: any; // LLMClient instance
  private activeAbortControllers: Map<number, AbortController> = new Map();
  private currentConnectionId: number | null = null;

  /**
   * Диагностическое значение context window.
   * HomeTavern больше не использует его для ограничения max_tokens:
   * решение о достижении лимита принимает провайдер.
   */
  private maxContextLength: number = 0;

  // ==================== Retry Configuration ====================
  /**
   * Максимальное количество повторных попыток при ошибках API
   */
  private readonly maxRetries: number = 3;

  /**
   * Базовая задержка между повторными попытками (в миллисекундах)
   * Используется экспоненциальная задержка: baseDelay * 2^attempt
   */
  private readonly baseRetryDelay: number = 1000; // 1 секунда

  /**
   * Максимальная задержка между повторными попытками (в миллисекундах)
   * Не превышает это значение даже при большой степени экспоненты
   */
  private readonly maxRetryDelay: number = 30000; // 30 секунд
  /**
   * Максимальный вывод (response tokens).
   * Значение берётся из активного подключения в БД/UI и отправляется провайдеру как есть.
   */
  private maxOutputTokens: number = 32000;

  /**
   * Диагностический флаг: использовался ранее для cloud-provider лимитов.
   * Сейчас не ограничивает max_tokens.
   */
  private useContextLimits: boolean = false;

  /**
   * Проверяет, является ли ошибка "временной" и требует повторной попытки.
   * Временные ошибки — сетевые сбои, таймауты, серверные ошибки 5xx, rate limiting 429.
   */
  private isRetryableError(error: any): { retryable: boolean; delay?: number } {
    // Если это AbortError — отмена пользователем, не повторяем
    if (error?.name === 'AbortError') {
      return { retryable: false };
    }

    const message = error?.message || String(error);
    const statusCode = error?.status || error?.response?.status;
    const code = error?.code;

    // HTTP 429 Too Many Requests — rate limiting, повторяем с увеличенной задержкой
    if (statusCode === 429) {
      const retryAfter = error?.headers?.['retry-after'] 
        ? parseInt(error.headers['retry-after'], 10) * 1000 
        : undefined;
      return { 
        retryable: true, 
        delay: retryAfter || this.baseRetryDelay * 4 // увеличенная задержка для rate limiting
      };
    }

    // HTTP 5xx серверные ошибки — повторяем
    if (statusCode && statusCode >= 500 && statusCode < 600) {
      return { retryable: true };
    }

    // HTTP 400 Bad Request — проблема в запросе, не повторяем
    if (statusCode === 400) {
      return { retryable: false };
    }

    // HTTP 401/403 — ошибки авторизации, не повторяем
    if (statusCode === 401 || statusCode === 403) {
      return { retryable: false };
    }

    // HTTP 404 — неверный endpoint, не повторяем
    if (statusCode === 404) {
      return { retryable: false };
    }

    // HTTP 413 Payload Too Large — промпт слишком большой, не повторяем
    if (statusCode === 413) {
      return { retryable: false };
    }

    // Сетевые ошибки Node.js
    if (code === 'ECONNRESET' || 
        code === 'ECONNREFUSED' || 
        code === 'ETIMEDOUT' || 
        code === 'EAI_AGAIN' ||
        code === 'ENOTFOUND') {
      return { retryable: true };
    }

    // Timeout error — таймаут запроса
    if (message.includes('timeout') || 
        message.includes('ETIMEDOUT') ||
        message.includes('Request timed out')) {
      return { retryable: true };
    }

    // Network request failed / fetch error
    if (message.includes('network error') || 
        message.includes('fetch failed') ||
        message.includes('ECONNREFUSED') ||
        message.toLowerCase().includes('econnrefused')) {
      return { retryable: true };
    }

    // Unknown errors — пробуем повторить один раз с минимальной задержкой
    if (error || true) {
      return { retryable: true, delay: this.baseRetryDelay };
    }

    return { retryable: false };
  }

  /**
   * Универсальная функция для выполнения операций с повторными попытками.
   * Использует экспоненциальную задержку: baseDelay * 2^attempt.
   * 
   * @param operation — асинхронная операция для выполнения
   * @param contextLabel — метка для логирования (например, 'generateStream for chat 123')
   * @param maxRetries — максимальное количество попыток (по умолчанию из класса)
   * @param baseDelay — базовая задержка в мс (по умолчанию из класса)
   * @returns результат операции
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    contextLabel: string,
    maxRetries?: number,
    baseDelay?: number
  ): Promise<T> {
    const retries = maxRetries ?? this.maxRetries;
    const base = baseDelay ?? this.baseRetryDelay;

    let lastError: any;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Проверяем, стоит ли повторять
        const { retryable, delay } = this.isRetryableError(error);
        
        if (!retryable || attempt >= retries) {
          // Не повторяем или исчерпали попытки
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (!retryable) {
            console.log(`[LLMService.${contextLabel}] Non-retryable error:`, errorMsg);
          } else {
            console.error(`[LLMService.${contextLabel}] Max retries (${retries}) reached. Last error:`, errorMsg);
          }
          throw error;
        }

        // Вычисляем задержку с экспоненциальным backoff
        const exponentialDelay = base * Math.pow(2, attempt);
        const actualDelay = Math.min(exponentialDelay, delay ?? this.maxRetryDelay);
        const errorMsg = error instanceof Error ? error.message : String(error);

        console.log(
          `[LLMService.${contextLabel}] Retry ${attempt + 1}/${retries} in ${actualDelay}ms... ` +
          `(Error: ${errorMsg})`
        );

        // Ждаем перед повторной попыткой
        await new Promise(resolve => setTimeout(resolve, actualDelay));
      }
    }

    // Теоретически недостижимо, но TypeScript требует
    throw lastError;
  }

  /**
   * Определяет, является ли провайдер облачным (с лимитом контекста)
   */
  private _isCloudProvider(): boolean {
    const url = this.baseURL.toLowerCase();
    // OpenRouter, z.ai, SiliconFlow и другие cloud провайдеры имеют жёсткий лимит контекста
    return url.includes('openrouter') || 
           url.includes('z.ai') || 
           url.includes('together') ||
           url.includes('perplexity') ||
           url.includes('fireworks') ||
           url.includes('anyscale') ||
           url.includes('siliconflow');
  }

  /**
   * Определяет, является ли провайдер Silicon Flow
   */
  private _isSiliconFlow(): boolean {
    const url = this.baseURL.toLowerCase();
    return url.includes('siliconflow');
  }

  /**
   * Получает стоп-токены в зависимости от провайдера
   * Для Silicon Flow и некоторых других cloud провайдеров возвращает пустой массив,
   * так как их модели не используют специфические стоп-токены в формате ChatML
   */
  private getStopTokens(): string[] | null {
    // Для Silicon Flow — не используем стоп-токены (модели могут их не поддерживать)
    if (this._isSiliconFlow()) {
      return null;
    }
    // По умолчанию — стоп-токены для ChatML/instruct форматов
    return ['\n\nHuman:', '\n\nAssistant:'];
  }

  constructor() {
    // Load from database first (active connection), fallback to .env
    this.baseURL = process.env.LLM_BASE_URL || 'http://localhost:1234/v1';
    this.apiKey = process.env.LLM_API_KEY || 'local-model-key';
    this.model = process.env.LLM_MODEL || 'qwen-3.5';
    this.maxTokens = parseInt(process.env.LLM_MAX_TOKENS || '') || 64000;
    this.maxOutputTokens = this.maxTokens; // По умолчанию = maxTokens
    this.maxContextLength = parseInt(process.env.LLM_MAX_CONTEXT_LENGTH || '') || 0;
    this.useContextLimits = false;

    // Try to load active connection from database on startup
    this._loadActiveConnectionFromDB();

    // Debug logging
    console.log('[LLMService] LLM_BASE_URL:', this.baseURL);
    console.log('[LLMService] LLM_MODEL:', this.model);
    console.log('[LLMService] LLM_API_KEY:', this.apiKey ? '***SET***' : 'NOT SET');
    console.log('[LLMService] Active connection ID:', this.currentConnectionId);

    // Try to initialize LLMClient
    this._initLLMClient();
  }

  /**
   * Load the active LLM connection from database for the first admin user
   * This ensures the correct connection is used after server restart
   */
  private _loadActiveConnectionFromDB(): void {
    try {
      // Get all users to find the first admin user
      const users = userRepository.getAllUsers();
      const adminUser = users.find((u: any) => u.role === 'admin');
      
      if (!adminUser) {
        console.log('[LLMService] No admin user found, using .env settings');
        return;
      }

      // Get the active connection for this user
      const activeConn = llmConnectionRepository.getActiveByUserId(adminUser.id);
      
      if (!activeConn) {
        console.log('[LLMService] No active LLM connection found in database, using .env settings');
        return;
      }

      // Get decrypted key
      const decryptedConn = llmConnectionRepository.getByIdWithDecryptedKey(activeConn.id);
      if (!decryptedConn) {
        console.log('[LLMService] Could not decrypt connection, using .env settings');
        return;
      }

      // Update LLM service settings from database connection
      this.currentConnectionId = activeConn.id;
      this.baseURL = decryptedConn.base_url;
      this.apiKey = decryptedConn.api_key_decrypted;
      this.model = decryptedConn.model;
      this.maxTokens = decryptedConn.max_tokens;
      this.maxOutputTokens = this.maxTokens;
      this.maxContextLength = 0;
      this.useContextLimits = false;
      // reasoning: 1 = enabled (default), 0 = disabled
      this.reasoning = decryptedConn.reasoning !== 0;

      console.log('[LLMService] Loaded active connection from database:', decryptedConn.name);
      console.log('[LLMService] Connection ID:', activeConn.id);
      console.log('[LLMService] BASE_URL:', this.baseURL);
      console.log('[LLMService] MODEL:', this.model);
      console.log('[LLMService] MAX_TOKENS:', this.maxTokens);
      console.log('[LLMService] MAX_CONTEXT_LENGTH:', this.maxContextLength);

      // Reinitialize client with database settings
      this._initLLMClient();
    } catch (error) {
      console.warn('[LLMService] Failed to load active connection from DB, using .env settings:', error);
    }
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
      this.maxOutputTokens = this.maxTokens;
      this.maxContextLength = 0;
      this.useContextLimits = false;
      // reasoning: 1 = enabled (default), 0 = disabled
      this.reasoning = conn.reasoning !== 0;

      // Reinitialize client with new settings
      this._initLLMClient();

      console.log('[LLMService] Switched to connection:', conn.name);
      console.log('[LLMService] New BASE_URL:', this.baseURL);
      console.log('[LLMService] New MODEL:', this.model);
      console.log('[LLMService] New MAX_TOKENS:', this.maxTokens);
      console.log('[LLMService] New MAX_CONTEXT_LENGTH:', this.maxContextLength);

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
   * Update reasoning mode without reinitializing the client.
   * Called when the active connection's reasoning setting is toggled.
   */
  setReasoning(enabled: boolean): void {
    this.reasoning = enabled;
    console.log(`[LLMService] Reasoning ${enabled ? 'enabled' : 'disabled'} (updated via API)`);
  }

  /**
   * Get current connection info (without API key)
   */
  getConnectionInfo() {
    return {
      baseURL: this.baseURL,
      model: this.model,
      maxTokens: this.maxTokens,
      maxContextLength: this.maxContextLength,
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
     * @param userMessage - Сообщение пользователя (добавляется отдельно, не дублируется из history)
     * @param abortSignal - Signal для отмены генерации
     * @param timingContext - Optional context to track first token timing (excludes preprocessing from speed calc)
     * @param preFilteredHistory - Optional pre-filtered history (last user message already removed)
     * @returns Асинхронный итератор с чанками (reasoning_token и content_token)
     */
    async *generateStream(
      userId: number,
      chatId: number,
      userMessage: string,
      abortSignal?: AbortSignal,
      timingContext?: StreamTimingContext,
      preFilteredHistory?: any[]
    ): AsyncGenerator<StreamChunk> {
    // ============================================================================
    // 🔍 РАННЕЕ ЛОГИРОВАНИЕ — САМОЕ ПЕРВОЕ что срабатывает в generateStream
    // ============================================================================
    console.log(`[LLMService.generateStream] ENTERED: userId=${userId}, chatId=${chatId}, userMessageLen=${userMessage.length}`);
    
    const timeoutMs = 900000; // 15 минут таймаут
    const startTime = Date.now();
    let contentTokenCount = 0;
    let reasoningTokenCount = 0;
    let lastUsage: Usage | undefined;

    try {
      console.log(`[LLMService.generateStream] Getting chat context...`);
      
      // Получаем контекст чата
      const context = await this.getChatContext(userId, chatId);
      if (!context) {
        throw new Error('Chat context not found');
      }

      const { character, heroProfile, heroName, historyMessages } = context;
      
      // Если передана предварительно отфильтрованная история (без последнего user сообщения),
      // используем её вместо полной истории из БД
      const effectiveHistoryFromProvider = preFilteredHistory !== undefined 
        ? preFilteredHistory 
        : historyMessages;

      // Debug: логирование текущего сообщения перед отправкой в LLM
      console.log('[LLMService] Current user message to LLM:', userMessage.substring(0, 100));
      console.log('[LLMService] Hero name:', heroName);
      console.log('[LLMService] Hero profile:', heroProfile);

      // Получаем сжатые блоки для чата
      const compressedBlocks = chatBlockRepository.getBlocksByChatId(chatId);
      
      // HomeTavern больше не ограничивает max_tokens.
      // Значение из активного подключения в БД/UI отправляется провайдеру как есть.
      const effectiveMaxOutput = this.maxTokens;
      console.log(`[LLMService] Provider-managed limits: using max_tokens from active connection = ${effectiveMaxOutput}`);
      
      // Используем передную историю (без последнего user сообщения и без сжатых блоков)
      // ВАЖНО: effectiveHistoryFromProvider уже без последнего user сообщения от роута
      let finalHistoryForFormatting = effectiveHistoryFromProvider;
      
      if (compressedBlocks && compressedBlocks.length > 0) {
        // Сжатие уже используется — фильтруем только сообщения, не входящие в сжатые блоки
        // ВАЖНО: сохраняем start_message_id каждого блока, чтобы formatMessagesForQwenInternal
        // мог добавить summary для сжатого блока
        const compressedMsgIds = new Set<number>();
        const startMessageIds = new Set<number>();
        for (const block of compressedBlocks) {
          const messageIds = JSON.parse(block.original_message_ids || '[]') as number[];
          messageIds.forEach(id => compressedMsgIds.add(id));
          // Сохраняем start_message_id отдельно (проверяем на null)
          if (block.start_message_id !== null) {
            startMessageIds.add(block.start_message_id);
          }
        }
        // Фильтруем: исключаем сообщения из сжатых блоков, НО сохраняем start_message_id
        finalHistoryForFormatting = effectiveHistoryFromProvider.filter((m: any) => !compressedMsgIds.has(m.id) || m.hidden || startMessageIds.has(m.id));
        console.log(`[LLMService] Using compressed history: ${finalHistoryForFormatting.length} messages (${compressedBlocks.length} blocks compressed)`);
      }
      
      // Формируем историю сообщений для Qwen 3.5 с учётом сжатых блоков
      // ВАЖНО: используем finalHistoryForFormatting (который уже без последнего user сообщения и без сжатых),
      // а formatMessagesForQwen сам добавит currentMessage в конец через параметр userMessage
      const messages = compressedBlocks && compressedBlocks.length > 0
        ? formatMessagesForQwenWithCompression(
            userId,
            character,
            heroProfile,
            heroName,
            finalHistoryForFormatting,
            userMessage,
            compressedBlocks
          )
        : formatMessagesForQwen(
            userId,
            character,
            heroProfile,
            heroName,
            finalHistoryForFormatting,
            userMessage
          );

      // Проверяем наличие клиента
      if (!this.client) {
        // Fallback: эмуляция потока
        console.log('LLM Service: Using fallback stream generation');
        yield* this.generateFallbackStream(userMessage);
        return;
      }

       // Записываем время начала генерации ТОЛЬКО при получении первого токена.
        // Это исключает время предпроцессинга (получение контекста, форматирование сообщений) из расчёта скорости.
        // timingContext.firstTokenTime будет установлен в первом же yield.

      const contextReserveTokens = 2048;

      console.log(`[LLMService.generateStream] Context obtained, formatting messages...`);

      // ============================================================================
      // 🔍 Оценка размера промпта.
      // Для cloud API, где max_tokens должен укладываться вместе с input в общий
      // context window, это значение используется для безопасного ограничения output.
      // ============================================================================

      let estimatedInputTokens = 0;
      for (const msg of messages) {
        estimatedInputTokens += estimateTokenCount(msg.content || '');
      }
      estimatedInputTokens += messages.length * 4;

      const finalMaxOutput = calculateSafeMaxOutputTokens({
        requestedMaxOutput: effectiveMaxOutput,
        estimatedInputTokens,
        explicitContextLength: this.maxContextLength,
        baseURL: this.baseURL,
        model: this.model,
        reserveTokens: contextReserveTokens,
      });
      const resolvedContextLength = this.maxContextLength > 0
        ? this.maxContextLength
        : getModelContextLimit(this.baseURL, this.model);

      console.log(`[LLMService.generateStream] Estimated input tokens: ${estimatedInputTokens}`);
      console.log(`[LLMService.generateStream] Context length used for max_tokens cap: ${resolvedContextLength}`);
      console.log(`[LLMService.generateStream] Context reserve tokens: ${contextReserveTokens}`);
      console.log(`[LLMService.generateStream] Requested max_tokens from connection: ${effectiveMaxOutput}`);
      console.log(`[LLMService.generateStream] Final max_tokens to send: ${finalMaxOutput}`);
      if (finalMaxOutput !== effectiveMaxOutput) {
        console.log(`[LLMService.generateStream] max_tokens capped to fit input + output within context window`);
      }
      
      // ============================================================================
      // 🔍 ЛОГИРОВАНИЕ ТОЧНОГО ЗАПРОСА К API В ФАЙЛ ДЛЯ ДИАГНОСТИКИ
      // ============================================================================
      
      // Формируем точный JSON запроса который отправляется в API
      // Стоп-токены зависят от провайдера (для Silicon Flow — null)
      const stopTokens = this.getStopTokens();
      
      // ============================================================================
      // 🔍 ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ЗАПРОСА ДЛЯ ДИАГНОСТИКИ
      // ============================================================================
      console.log(`[LLMService.generateStream] >>> API Details:`);
      console.log(`[LLMService.generateStream]     BASE_URL: ${this.baseURL}`);
      console.log(`[LLMService.generateStream]     MODEL: ${this.model}`);
      console.log(`[LLMService.generateStream]     ENDPOINT: /chat/completions`);
      console.log(`[LLMService.generateStream]     FULL_URL: ${this.baseURL.replace(/\/+$/, '')}/chat/completions`);
      console.log(`[LLMService.generateStream]     STOP_TOKENS: ${stopTokens === null ? 'null (provider-specific)' : JSON.stringify(stopTokens)}`);
      console.log(`[LLMService.generateStream]     MESSAGES_COUNT: ${messages.length}`);
      console.log(`[LLMService.generateStream]     FIRST_MESSAGE_ROLE: ${messages[0]?.role}`);
      console.log(`[LLMService.generateStream]     FIRST_MESSAGE_LEN: ${(messages[0]?.content || '').length}`);
      console.log(`[LLMService.generateStream]     LAST_MESSAGE_ROLE: ${messages[messages.length - 1]?.role}`);
      console.log(`[LLMService.generateStream]     LAST_MESSAGE_LEN: ${(messages[messages.length - 1]?.content || '').length}`);
      
      // Создаём папку logs если нет (используем await getFsUtils())
      const { fs: fsUtil, pathLib: pathLibUtil } = await getFsUtils();
      
      const logsDir = pathLibUtil.join(process.cwd(), 'logs');
      if (!fsUtil.existsSync(logsDir)) {
        fsUtil.mkdirSync(logsDir, { recursive: true });
      }
      
      // Формируем имя файла: ДАТА_ВРЕМЯ_IDЧАТА.log
      const now = new Date();
      const dateStr = now.toISOString().replace(/:/g, '-').split('.')[0]; // YYYY-MM-DDTHH-mm-ss
      const fileName = `${dateStr}_chat${chatId}.log`;
      const filePath = pathLibUtil.join(logsDir, fileName);
      
      const exactRequestBody: Record<string, any> = {
        model: this.model,
        messages: messages,
        stream: true,
        max_tokens: finalMaxOutput,
      };
      if (stopTokens !== null) {
        exactRequestBody.stop = stopTokens;
      }
      
      let logContent = '';
      logContent += `# ========================================\n`;
      logContent += `# Точный запрос к llama.cpp API\n`;
      logContent += `# ========================================\n`;
      logContent += `\n`;
      logContent += `# URL: POST ${this.baseURL}/chat/completions\n`;
      logContent += `# Headers:\n`;
      logContent += `#   Content-Type: application/json\n`;
      logContent += `\n`;
      logContent += `# Body (JSON — скопируйте и отправьте через curl для тестирования):\n`;
      logContent += JSON.stringify(exactRequestBody, null, 2);
      logContent += `\n`;
      logContent += `\n`;
      logContent += `# ========================================\n`;
      logContent += `# Метаданные\n`;
      logContent += `# ========================================\n`;
      logContent += `Date: ${now.toISOString()}\n`;
      logContent += `chatId: ${chatId}\n`;
      logContent += `userId: ${userId}\n`;
      logContent += `model: ${this.model}\n`;
      logContent += `baseURL: ${this.baseURL}\n`;
      logContent += `max_tokens: ${finalMaxOutput}\n`;
      logContent += `stop tokens: ${stopTokens === null ? 'null (provider-specific)' : JSON.stringify(stopTokens)}\n`;
      logContent += `useContextLimits: ${this.useContextLimits}\n`;
      logContent += `messages count: ${messages.length}\n`;
      logContent += `\n`;
      logContent += `# ========================================\n`;
      
      // Записываем лог в файл
      try {
        fsUtil.writeFileSync(filePath, logContent, 'utf-8');
        console.log(`[LLMService.generateStream] >>> Prompt logged to file: ${filePath}`);
      } catch (logError) {
        console.error(`[LLMService.generateStream] FAILED to write log file:`, logError);
      }

        // Формируем запрос с правильными стоп-токенами для текущего провайдера
        // Для Silicon Flow — стоп-токены не используются (модели могут их не поддерживать)
        // Для локальных серверов (llama.cpp) — позволяют использовать KV cache чекпоинты
        const streamRequest: Record<string, any> = {
          model: this.model,
          messages: messages,
          stream: true,
          max_tokens: finalMaxOutput,
          chat_template_kwargs: { enable_thinking: this.reasoning },
        };
        if (stopTokens !== null) {
          streamRequest.stop = stopTokens;
        }
        
        console.log(`[LLMService.generateStream] reasoning: ${this.reasoning}, chat_template_kwargs: ${JSON.stringify({ enable_thinking: this.reasoning })}`);

        // Вызываем API с retry логикой при временных ошибках
        const stream = await this.withRetry(
          async () => {
            return await this.client.chatCompletionsCreate(streamRequest, { signal: abortSignal });
          },
          `generateStream chat${chatId}`
        );

        // Обрабатываем поток
        for await (const chunk of stream) {
          // Устанавливаем время первого токена (если ещё не установлено)
          // Это включает как reasoning tokens, так и content tokens - первый полученный токен считается
          if (timingContext && timingContext.firstTokenTime === 0) {
            timingContext.firstTokenTime = Date.now();
            console.log('[LLMService] First token received at:', new Date().toISOString());
          }

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
