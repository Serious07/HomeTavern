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
  onProgress?: CompressionProgressCallback; // Callback для отправки прогресса
}

export interface CompressionProgressData {
  currentBlock: number;
  totalBlocks: number;
  status: string;
  title?: string;
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
   */
  async compressChat(
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

    // 4. Разбиваем на семантические блоки
    const semanticBlocks = this.splitIntoSemanticBlocks(messages, maxBlockMessages);
    const totalBlocks = semanticBlocks.length;

    // Отправляем начальный прогресс
    if (onProgress) {
      onProgress({ currentBlock: 0, totalBlocks, status: 'Начало сжатия...' });
    }

    // 5. Генерируем summary для каждого блока
    const existingBlocks = chatBlockRepository.getBlocksByChatId(chatId);
    const previousSummaries = existingBlocks.map(b => b.summary);

    const compressionBlocks: CompressionBlock[] = [];
    let sortOrder = chatBlockRepository.getMaxSortOrder(chatId);

    for (let i = 0; i < semanticBlocks.length; i++) {
      const block = semanticBlocks[i];
      const currentBlockNum = i + 1;

      // Отправляем прогресс перед обработкой блока
      if (onProgress) {
        onProgress({ 
          currentBlock: currentBlockNum - 1, 
          totalBlocks, 
          status: `Обработка блока ${currentBlockNum} из ${totalBlocks}...` 
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
        useTranslations
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
          status: `Обработан блок ${currentBlockNum} из ${totalBlocks}`,
          title: compressionBlock.title
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
      heroName,
      false
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
    useTranslations: boolean = false
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

    // Промпт для суммаризации — строгий формат без мыслей
    const prompt = `Ты — ассистент для сжатия истории диалога.

ВАЖНО: Ты НЕ ДОЛЖЕН писать рассуждения, анализ или мыслительный процесс.
Ты НЕ ДОЛЖЕН использовать слова "thinking", "analyze", "input", "task" и т.п.
Ты НЕ ДОЛЖЕН использовать нумерованные списки или маркированные пункты.
Ты НЕ ДОЛЖЕН писать "Here's a thinking process" или подобные фразы.

Ты должен вывести ТОЛЬКО два строки:
1. Строка ЗАГОЛОВОК:
2. Строка ПЕРЕСКАЗ:

${previousContext}Текущая часть истории:
${blockText}

${languageHint}

Ответь ТОЛЬКО в этом формате, ничего больше:
ЗАГОЛОВОК: <короткий заголовок до 10 слов>
ПЕРЕСКАЗ: <краткий пересказ 3-7 предложений>`;

    // Отправляем запрос к LLM
    const messages: LLMMessage[] = [
      { role: 'system', content: 'Ты — ассистент для сжатия истории диалога. Твоя задача — отвечать ТОЛЬКО в формате:\nЗАГОЛОВОК: <текст>\nПЕРЕСКАЗ: <текст>\n\nСтрого запрещено:\n- Писать рассуждения или мыслительный процесс\n- Использовать слова "thinking", "analyze", "thought"\n- Использовать нумерованные или маркированные списки\n- Писать "Here\'s a thinking process" или подобные фразы\n- Выводить что-либо кроме формата ЗАГОЛОВОК/ПЕРЕСКАЗ\n\nЕсли ты не следуешь этому правилу, система сломается. Отвечай ТОЛЬКО в указанном формате.' },
      { role: 'user', content: prompt }
    ];

    let summary = '';
    let title = 'Сжатая история';

    try {
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
        max_tokens: 2000,
      });

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