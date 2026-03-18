/**
 * Переводчик Google Translate
 * Основан на реализации из SillyTavern
 */

import { Translator } from 'google-translate-api-x';
import fetch from 'node-fetch';
import { BaseTranslator } from './base';
import {
  TranslationOptions,
  TranslationResult,
  TranslationError,
  TranslatorProvider,
} from '../types';
import { chunkText, restoreTextWithLinks, chunkWithLinks } from '../chunker';

/**
 * Переводчик Google Translate
 */
export class GoogleTranslator extends BaseTranslator {
  private readonly chunkSize: number = 5000;

  constructor(config: {
    apiKey?: string;
    endpoint?: string;
    timeout?: number;
    retries?: number;
    chunkSize?: number;
  }) {
    super({
      provider: 'google',
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      timeout: config.timeout,
      retries: config.retries,
    });

    this.chunkSize = config.chunkSize || this.chunkSize;
  }

  /**
   * Выполняет перевод текста с использованием Google Translate
   * @param text Текст для перевода
   * @param options Опции перевода
   * @returns Результат перевода
   */
  async translate(text: string, options: TranslationOptions): Promise<TranslationResult> {
    this.validateInput(text, options.targetLanguage);

    const targetLang = this.normalizeLanguageCode(options.targetLanguage);

    // Обработка специальных кодов языков
    const normalizedTargetLang = this.normalizeGoogleLanguageCode(targetLang);

    try {
      // Разделяем текст на чанки для обработки
      const { chunks, links } = chunkWithLinks(text, this.chunkSize);

      const translatedChunks: string[] = [];

      for (const chunk of chunks) {
        if (chunk.trim().length === 0) {
          continue;
        }

        const translatedChunk = await this.translateChunk(chunk, normalizedTargetLang);
        translatedChunks.push(translatedChunk);
      }

      // Восстанавливаем текст с сохранением ссылок
      const translatedText = restoreTextWithLinks(translatedChunks, links);

      return {
        text: translatedText,
        sourceLanguage: undefined, // Google определяет язык автоматически
        provider: this.provider,
      };
    } catch (error) {
      if (error instanceof TranslationError) {
        throw error;
      }
      throw this.createError(
        `Google Translate translation failed: ${error instanceof Error ? error.message : String(error)}`,
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
    const translator = new Translator({
      to: targetLang,
      requestFunction: fetch as any,
    });

    const result = await translator.translate(chunk);
    return result.text;
  }

  /**
   * Нормализует код языка для Google Translate
   * @param lang Код языка
   * @returns Нормализованный код
   */
  private normalizeGoogleLanguageCode(lang: string): string {
    // Специфичные преобразования для Google Translate
    const googleLanguageMap: Record<string, string> = {
      'zh': 'zh-CN', // Google предпочитает zh-CN для упрощённого китайского
      'pt': 'pt',    // Google использует 'pt' для португальского
    };

    return googleLanguageMap[lang] || lang;
  }

  /**
   * Определяет язык текста
   * @param text Текст для определения языка
   * @returns Код языка
   */
  async detectLanguage(text: string): Promise<string> {
    try {
      const translator = new Translator({
        to: 'en',
        requestFunction: fetch as any,
      });

      const result = await translator.translate(text);
      // Google Translate API не всегда возвращает source, используем 'unknown' если нет
      return (result as any).source || 'unknown';
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
    // Google Translate поддерживает более 100 языков
    // Возвращаем базовый список
    return [
      'af', 'sq', 'am', 'ar', 'hy', 'az', 'eu', 'be', 'bn', 'bs',
      'bg', 'ca', 'zh-CN', 'zh-TW', 'hr', 'cs', 'da', 'nl', 'en',
      'eo', 'et', 'fi', 'fr', 'gl', 'ka', 'de', 'el', 'gu', 'ht',
      'he', 'hi', 'hu', 'is', 'id', 'ga', 'it', 'ja', 'jw', 'kn',
      'kk', 'km', 'ko', 'ku', 'ky', 'lo', 'la', 'lv', 'lt', 'mk',
      'ms', 'ml', 'mt', 'mi', 'mr', 'mn', 'my', 'ne', 'no', 'fa',
      'pl', 'pt', 'pa', 'ro', 'ru', 'sr', 'sk', 'sl', 'es', 'sw',
      'sv', 'tl', 'ta', 'te', 'th', 'tr', 'uk', 'ur', 'uz', 'vi',
      'cy', 'yi', 'zu',
    ];
  }
}