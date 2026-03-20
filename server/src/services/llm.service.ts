/**
 * LLM Service - Integration with llm-client library
 * Provides streaming generation with reasoning and content separation
 */

import { characterRepository } from '../repositories/character.repository';
import { chatRepository } from '../repositories/chat.repository';
import { userRepository } from '../repositories/user.repository';
import { heroVariationRepository } from '../repositories/hero.variation.repository';
import { contextRepository } from '../repositories/context.repository';

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
 * Форматирование истории сообщений для Qwen 3.5
 * Системный промпт в САМОМ НАЧАЛЕ, затем профиль героя, история, текущее сообщение
 */
export function formatMessagesForQwen(
  character: any,
  heroProfile: string | null,
  heroName: string | null,
  historyMessages: any[],
  currentMessage: string
): LLMMessage[] {
  const messages: LLMMessage[] = [];

  // 1. Системный промпт персонажа
  const systemParts: string[] = [];
  
  if (character.system_prompt) {
    const processedSystemPrompt = replaceUserPlaceholders(character.system_prompt, heroName);
    systemParts.push(processedSystemPrompt);
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

export class LLMService {
  private baseURL: string;
  private apiKey: string;
  private model: string;
  private client: any; // LLMClient instance

  constructor() {
    this.baseURL = process.env.LLM_BASE_URL || 'http://localhost:1234/v1';
    this.apiKey = process.env.LLM_API_KEY || 'local-model-key';
    this.model = process.env.LLM_MODEL || 'qwen-3.5';

    // Debug logging
    console.log('[LLMService] LLM_BASE_URL:', this.baseURL);
    console.log('[LLMService] LLM_MODEL:', this.model);
    console.log('[LLMService] LLM_API_KEY:', this.apiKey ? '***SET***' : 'NOT SET');

    // Инициализация LLMClient (предполагается, что llm-client установлен)
    try {
      // Динамический импорт llm-client
      const { LLMClient } = require('llm-client');
      this.client = new LLMClient({
        baseURL: this.baseURL,
        apiKey: this.apiKey,
      });
      console.log('[LLMService] LLMClient initialized successfully');
    } catch (error) {
      console.warn('llm-client not installed. Using fallback implementation.');
      console.warn('[LLMService] Error:', error);
      this.client = null;
    }
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
 * @returns Асинхронный итератор с чанками (reasoning_token и content_token)
 */
  async *generateStream(
    userId: number,
    chatId: number,
    userMessage: string
  ): AsyncGenerator<StreamChunk> {
    const timeoutMs = 60000; // 60 секунд таймаут
    const startTime = Date.now();
    let contentTokenCount = 0;
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

      // Формируем историю сообщений для Qwen 3.5
      const messages = formatMessagesForQwen(
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
      const stream = await this.client.chatCompletionsCreate({
        model: this.model,
        messages: messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 999999, // Увеличено для поддержки длинных ответов с Reasoning
      });

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

      // Сохраняем информацию о токенах в БД после завершения генерации
      if (lastUsage) {
        const totalTokens = lastUsage.total_tokens;
        console.log(`[LLMService] Saving token usage for chat ${chatId}: ${totalTokens} total tokens`);
        contextRepository.updateCachedStats(chatId, totalTokens, new Date().toISOString());
      }

      // Логирование метрик генерации
      const endTime = Date.now();
      const durationSecs = (endTime - startTime) / 1000;
      const tokensPerSec = durationSecs > 0 ? contentTokenCount / durationSecs : 0;
      console.log(`[LLMService] Generation stats: ${contentTokenCount} tokens, ${durationSecs.toFixed(2)}s, ${tokensPerSec.toFixed(2)} tokens/sec`);
    } catch (error) {
      const elapsed = Date.now() - startTime;
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
}

export const llmService = new LLMService();
