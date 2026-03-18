/**
 * Переводчик LibreTranslate
 * Основан на реализации из SillyTavern
 */

import fetch from 'node-fetch';
import { BaseTranslator } from './base';
import {
  TranslationOptions,
  TranslationResult,
  TranslationError,
  TranslatorProvider,
} from '../types';

/**
 * Переводчик LibreTranslate
 */
export class LibreTranslator extends BaseTranslator {
  private readonly defaultEndpoint = 'http://127.0.0.1:5000/translate';

  constructor(config: {
    apiKey?: string;
    endpoint?: string;
    timeout?: number;
    retries?: number;
  }) {
    super({
      provider: 'libre',
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      timeout: config.timeout,
      retries: config.retries,
    });
  }

  /**
   * Выполняет перевод текста с использованием LibreTranslate
   * @param text Текст для перевода
   * @param options Опции перевода
   * @returns Результат перевода
   */
  async translate(text: string, options: TranslationOptions): Promise<TranslationResult> {
    this.validateInput(text, options.targetLanguage);

    const targetLang = this.normalizeLanguageCode(options.targetLanguage);

    // Нормализация кодов языков для LibreTranslate
    const normalizedLang = this.normalizeLibreLanguageCode(targetLang);

    try {
      const endpoint = this.endpoint || this.defaultEndpoint;

      const result = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: 'auto',
          target: normalizedLang,
          format: 'text',
          api_key: this.apiKey,
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!result.ok) {
        const errorText = await result.text();
        throw this.createError(
          `LibreTranslate API error: ${result.statusText}`,
          result.status,
          errorText
        );
      }

      const json = await result.json();

      if (!json.translatedText) {
        throw this.createError(
          'LibreTranslate API returned invalid response',
          undefined,
          json
        );
      }

      return {
        text: json.translatedText,
        sourceLanguage: json.source || undefined,
        provider: this.provider,
      };
    } catch (error) {
      if (error instanceof TranslationError) {
        throw error;
      }
      throw this.createError(
        `LibreTranslate translation failed: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        error
      );
    }
  }

  /**
   * Нормализует код языка для LibreTranslate
   * @param lang Код языка
   * @returns Нормализованный код
   */
  private normalizeLibreLanguageCode(lang: string): string {
    // Специфичные преобразования для LibreTranslate
    const libreLanguageMap: Record<string, string> = {
      'zh-CN': 'zh',
      'zh-TW': 'zh',
      'pt-BR': 'pt',
      'pt-PT': 'pt',
    };

    return libreLanguageMap[lang] || lang;
  }

  /**
   * Определяет язык текста
   * @param text Текст для определения языка
   * @returns Код языка
   */
  async detectLanguage(text: string): Promise<string> {
    try {
      const endpoint = this.endpoint || this.defaultEndpoint;

      const result = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: 'auto',
          target: 'en',
          format: 'text',
          api_key: this.apiKey,
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!result.ok) {
        throw this.createError(
          `LibreTranslate API error: ${result.statusText}`,
          result.status
        );
      }

      const json = await result.json();
      return json.source || 'unknown';
    } catch (error) {
      throw this.createError(
        `Language detection failed: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        error
      );
    }
  }

  /**
   * Получает список поддерживаемых языков
   * @returns Список языков
   */
  async getSupportedLanguages(): Promise<string[]> {
    // LibreTranslate поддерживает более 100 языков
    return [
      'af', 'sq', 'am', 'ar', 'hy', 'az', 'eu', 'be', 'bn', 'bs',
      'bg', 'ca', 'zh', 'hr', 'cs', 'da', 'nl', 'en', 'eo', 'et',
      'fi', 'fr', 'gl', 'ka', 'de', 'el', 'gu', 'ht', 'he', 'hi',
      'hu', 'is', 'id', 'ga', 'it', 'ja', 'kn', 'kk', 'ko', 'lv',
      'lt', 'mk', 'ms', 'ml', 'mt', 'mr', 'mn', 'ne', 'no', 'fa',
      'pl', 'pt', 'ro', 'ru', 'sr', 'sk', 'sl', 'es', 'sw', 'sv',
      'tl', 'ta', 'te', 'th', 'tr', 'uk', 'ur', 'vi', 'cy', 'zu',
    ];
  }
}