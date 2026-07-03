/**
 * LLM Translator - Uses LLM (OpenAI-compatible API) for translation
 * 
 * Uses the active LLM connection from the server's llm.service
 * System prompt can be customized via config.systemPrompt
 */

import {
  TranslationOptions,
  TranslationResult,
  TranslationError,
} from '../types';
import { BaseTranslator } from './base';

export interface LlmTranslatorConfig {
  systemPrompt?: string;
  // Other config inherited from BaseTranslator
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeout?: number;
  retries?: number;
}

const DEFAULT_SYSTEM_PROMPT =
  'You are a professional translator. Translate the following text from {sourceLang} to {targetLang}.\n' +
  'Output ONLY the translated text, nothing else. Do not add explanations, comments, or formatting.\n' +
  'Preserve the original tone, style, and meaning. Keep any special formatting like line breaks.';

export class LlmTranslator extends BaseTranslator {
  private systemPromptTemplate: string;
  private model: string;
  private llmClient: any; // LLMClient instance (lazy-loaded)

  constructor(config: LlmTranslatorConfig = {}) {
    super({
      provider: 'llm',
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      timeout: config.timeout,
      retries: config.retries,
    });

    this.systemPromptTemplate = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    this.model = config.model || process.env.LLM_MODEL || 'qwen-3.5';
  }

  /**
   * Set a custom system prompt template
   */
  setSystemPrompt(template: string): void {
    this.systemPromptTemplate = template;
  }

  /**
   * Build the system prompt with language codes filled in
   */
  private buildSystemPrompt(sourceLang: string, targetLang: string): string {
    return this.systemPromptTemplate
      .replace(/\{sourceLang\}/g, sourceLang)
      .replace(/\{targetLang\}/g, targetLang);
  }

  /**
   * Accept an already-constructed LLMClient instance (injected by the server).
   * This avoids require('llm-client') which fails when translation-library
   * is installed as a nested package without llm-client as a dependency.
   */
  setLlmClient(client: any): void {
    this.llmClient = client;
  }

  /**
   * Build a standalone LLMClient when no instance was injected.
   */
  private getLlmClient(): any {
    if (this.llmClient) return this.llmClient;
    try {
      // Try resolving from parent (server) first, then fallback
      const { LLMClient } = require('llm-client');
      this.llmClient = new LLMClient({
        baseURL: this.endpoint || process.env.LLM_BASE_URL || 'http://localhost:1234/v1',
        apiKey: this.apiKey || process.env.LLM_API_KEY || 'local-model-key',
        timeout: this.timeout || 30000,
      });
      return this.llmClient;
    } catch (error) {
      throw new TranslationError(
        'llm-client not available. Provide an LLMClient instance via setLlmClient() or install llm-client.',
        'llm',
        { details: error }
      );
    }
  }

  /**
   * Translate text using LLM (non-streaming)
   */
  async translate(text: string, options: TranslationOptions): Promise<TranslationResult> {
    this.validateInput(text, options.targetLanguage);

    const sourceLang = options.sourceLanguage || 'auto';
    const targetLang = this.normalizeLanguageCode(options.targetLanguage);
    const systemPrompt = this.buildSystemPrompt(sourceLang, targetLang);

    try {
      return await this.requestWithRetry(async () => {
        const client = this.getLlmClient();

        const result = await client.chatCompletionsCreate({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          temperature: 0.3,
          max_tokens: Math.min(text.length * 2, 4096),
          stream: false,
        });

        const completion = result as any;
        let translatedText = completion.choices?.[0]?.message?.content || text;

        // Очистка от <thinking>...</thinking> блоков у моделей с размышлениями (DeepSeek R1 и др.)
        translatedText = translatedText.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
        // Также удаляем голые reasoning артефакты типа <thought>...</thought>
        translatedText = translatedText.replace(/<thought>[\s\S]*?<\/thought>/gi, '');

        return {
          text: translatedText,
          sourceLanguage: sourceLang,
          provider: 'llm' as const,
          tokensUsed: completion.usage?.total_tokens,
        };
      });
    } catch (error) {
      if (error instanceof TranslationError) throw error;
      throw this.createError(
        `LLM translation failed: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        error
      );
    }
  }

  /**
   * Stream translation using LLM — returns an async iterator of tokens
   */
  async *translateStream(
    text: string,
    options: TranslationOptions
  ): AsyncGenerator<{ token: string; done?: boolean; fullText?: string }, void, undefined> {
    this.validateInput(text, options.targetLanguage);

    const sourceLang = options.sourceLanguage || 'auto';
    const targetLang = this.normalizeLanguageCode(options.targetLanguage);
    const systemPrompt = this.buildSystemPrompt(sourceLang, targetLang);

    try {
      const client = this.getLlmClient();
      let fullText = '';

      const result = await client.chatCompletionsCreate({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: Math.min(text.length * 2, 4096),
        stream: true,
      });

      const stream = result as AsyncIterable<any>;

      // Consume the stream
      // Для моделей с размышлениями (DeepSeek R1 и др.) нужно фильтровать reasoning_content
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        // Если чанк содержит reasoning_content, пропускаем его (это размышления модели)
        if (delta && 'reasoning_content' in delta && delta.reasoning_content) {
          continue;
        }
        const token = delta?.content || '';
        if (token) {
          fullText += token;
          yield { token };
        }
      }

      // Очистка final text от <thinking>...</thinking> блоков на случай,
      // если они всё же попали в content (некоторые модели смешивают)
      fullText = fullText.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
      fullText = fullText.replace(/<thought>[\s\S]*?<\/thought>/gi, '');

      // Final chunk with full text
      yield { token: '', done: true, fullText };
    } catch (error) {
      throw this.createError(
        `LLM streaming translation failed: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        error
      );
    }
  }

  /**
   * LLM can translate to any language it supports
   */
  async getSupportedLanguages(): Promise<string[]> {
    // Return all languages from the library — LLM supports them all
    const { SUPPORTED_LANGUAGES } = require('../types');
    return SUPPORTED_LANGUAGES.map((l: any) => l.code);
  }
}