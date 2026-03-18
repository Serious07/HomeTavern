/**
 * LLM Service - Integration with llm-client library
 * Provides streaming generation with reasoning and content separation
 */

import { characterRepository } from '../repositories/character.repository';
import { chatRepository } from '../repositories/chat.repository';
import { userRepository } from '../repositories/user.repository';

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

export interface ChatContext {
  chat: any;
  character: any;
  heroProfile: string | null;
  historyMessages: any[];
}

/**
 * Форматирование истории сообщений для Qwen 3.5
 * Системный промпт в САМОМ НАЧАЛЕ, затем профиль героя, история, текущее сообщение
 */
function formatMessagesForQwen(
  character: any,
  heroProfile: string | null,
  historyMessages: any[],
  currentMessage: string
): LLMMessage[] {
  const messages: LLMMessage[] = [];

  // 1. Объединяем системный промпт и профиль героя в ОДНО системное сообщение
  const systemParts: string[] = [];
  
  if (character.system_prompt) {
    systemParts.push(character.system_prompt);
  }
  
  if (heroProfile) {
    systemParts.push(`Профиль героя: ${heroProfile}`);
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
    messages.push({
      role,
      content: msg.content
    });
  }

  // 3. Текущее сообщение пользователя
  messages.push({
    role: 'user',
    content: currentMessage
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

      // Получаем профиль героя пользователя (из настроек или расширенных данных)
      // Для примера используем описание персонажа как профиль
      const heroProfile = character.description || null;

      // Получаем историю сообщений
      const historyMessages = chatRepository.getChatWithMessages(chatId)?.messages || [];

      return {
        chat,
        character,
        heroProfile,
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

    try {
      // Получаем контекст чата
      const context = await this.getChatContext(userId, chatId);
      if (!context) {
        throw new Error('Chat context not found');
      }

      const { character, heroProfile, historyMessages } = context;

      // Формируем историю сообщений для Qwen 3.5
      const messages = formatMessagesForQwen(
        character,
        heroProfile,
        historyMessages,
        userMessage
      );

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
        max_tokens: 2048,
      });

      // Обрабатываем поток
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta || {};
        const content = delta.content || '';

        if (content) {
          // Простая эвристика для разделения reasoning и content
          // В реальном использовании LLM должен возвращать reasoning отдельно
          if (delta.reasoning_content) {
            yield {
              type: 'reasoning_token',
              token: delta.reasoning_content
            };
          } else {
            yield {
              type: 'content_token',
              token: content
            };
          }
        }
      }
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
