/**
 * Переводчик Yandex Translate
 * Основан на реализации из SillyTavern
 */

import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { BaseTranslator } from './base';
import {
  TranslationOptions,
  TranslationResult,
  TranslationError,
  TranslatorProvider,
} from '../types';
import { chunkText, restoreTextWithLinks, chunkWithLinks } from '../chunker';

/**
 * Переводчик Yandex Translate
 */
export class YandexTranslator extends BaseTranslator {
  private readonly apiUrl = 'https://translate.yandex.net/api/v1/tr.json/translate';
  private readonly chunkSize: number = 5000;

  constructor(config: {
    apiKey?: string;
    endpoint?: string;
    timeout?: number;
    retries?: number;
    chunkSize?: number;
  } = {}) {
    super({
      provider: 'yandex',
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      timeout: config.timeout,
      retries: config.retries,
    });

    this.chunkSize = config.chunkSize || this.chunkSize;
  }

  /**
   * Выполняет перевод текста с использованием Yandex Translate
   * @param text Текст для перевода
   * @param options Опции перевода
   * @returns Результат перевода
   */
  async translate(text: string, options: TranslationOptions): Promise<TranslationResult> {
    this.validateInput(text, options.targetLanguage);

    const targetLang = this.normalizeLanguageCode(options.targetLanguage);

    try {
      // Разделяем текст на чанки для обработки
      const { chunks, links } = chunkWithLinks(text, this.chunkSize);

      const translatedChunks: string[] = [];

      for (const chunk of chunks) {
        if (chunk.trim().length === 0) {
          continue;
        }

        const translatedChunk = await this.translateChunk(chunk, targetLang);
        translatedChunks.push(translatedChunk);
      }

      // Восстанавливаем текст с сохранением ссылок
      const translatedText = restoreTextWithLinks(translatedChunks, links);

      return {
        text: translatedText,
        sourceLanguage: undefined, // Yandex определяет язык автоматически
        provider: this.provider,
      };
    } catch (error) {
      if (error instanceof TranslationError) {
        throw error;
      }
      throw this.createError(
        `Yandex Translate translation failed: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        error
      );
    }
  }

  /**
   * Переводит один чанк текста
   * @param chunk Текст для перевода
   * @param targetLang Целевой язык
   * @returns Переведённый текст
   */
  private async translateChunk(chunk: string, targetLang: string): Promise<string> {
    // Нормализация кодов языков для Yandex
    const normalizedLang = this.normalizeYandexLanguageCode(targetLang);

    // Генерируем уникальный идентификатор
    const ucid = uuidv4().replace(/-/g, '');

    // Формируем параметры запроса
    const params = new URLSearchParams();
    params.append('text', chunk);
    params.append('lang', normalizedLang);

    // Выполняем запрос - без API ключа, как в SillyTavern
    const result = await fetch(
      `${this.apiUrl}?ucid=${ucid}&srv=android&format=text`,
      {
        method: 'POST',
        body: params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        signal: AbortSignal.timeout(this.timeout),
      }
    );

    if (!result.ok) {
      const errorText = await result.text();
      throw this.createError(
        `Yandex Translate API error: ${result.statusText}`,
        result.status,
        errorText
      );
    }

    const json = await result.json();

    if (json.code !== 200) {
      throw this.createError(
        `Yandex Translate API error: ${json.code} - ${json.message}`,
        json.code,
        json
      );
    }

    // Yandex возвращает массив переведённых текстов
    return json.text.join('');
  }

  /**
   * Нормализует код языка для Yandex Translate
   * @param lang Код языка
   * @returns Нормализованный код
   */
  private normalizeYandexLanguageCode(lang: string): string {
    // Специфичные преобразования для Yandex Translate
    const yandexLanguageMap: Record<string, string> = {
      'zh': 'zh',      // Yandex использует 'zh' для китайского
      'pt': 'pt',      // Yandex использует 'pt' для португальского
      'ru': 'ru',      // Русский
      'en': 'en',      // Английский
      'de': 'de',      // Немецкий
      'fr': 'fr',      // Французский
      'es': 'es',      // Испанский
      'it': 'it',      // Итальянский
      'ja': 'ja',      // Японский
      'ko': 'ko',      // Корейский
    };

    return yandexLanguageMap[lang] || lang;
  }

  /**
   * Определяет язык текста
   * @param text Текст для определения языка
   * @returns Код языка
   */
  async detectLanguage(text: string): Promise<string> {
    try {
      const params = new URLSearchParams();
      params.append('text', text);
      params.append('lang', 'auto');

      const result = await fetch(
        `${this.apiUrl}?ucid=${uuidv4().replace(/-/g, '')}&srv=android&format=text`,
        {
          method: 'POST',
          body: params,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          signal: AbortSignal.timeout(this.timeout),
        }
      );

      if (!result.ok) {
        throw this.createError(
          `Yandex Translate API error: ${result.statusText}`,
          result.status
        );
      }

      const json = await result.json();
      return json.lang || 'unknown';
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
    // Yandex Translate поддерживает более 90 языков
    return [
      'af', 'sq', 'am', 'ar', 'hy', 'az', 'eu', 'be', 'bn', 'bs',
      'bg', 'ca', 'zh', 'hr', 'cs', 'da', 'nl', 'en', 'et', 'fi',
      'fr', 'ka', 'de', 'el', 'he', 'hi', 'hu', 'is', 'id', 'ga',
      'it', 'ja', 'kk', 'ko', 'lv', 'lt', 'mk', 'no', 'fa', 'pl',
      'pt', 'ro', 'ru', 'sr', 'sk', 'sl', 'es', 'sv', 'th', 'tr',
      'uk', 'ur', 'vi',
    ];
  }
}