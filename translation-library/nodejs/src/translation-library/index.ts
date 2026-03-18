/**
 * Translation Library - Универсальная библиотека перевода
 * 
 * Поддерживаемые провайдеры:
 * - Google Translate
 * - Yandex Translate
 * - LibreTranslate
 * 
 * @example
 * ```typescript
 * import { TranslationLibrary } from 'translation-library';
 * 
 * const translator = new TranslationLibrary({
 *   provider: 'google',
 * });
 * 
 * const result = await translator.translate('Hello, world!', 'ru');
 * console.log(result.text); // Привет, мир!
 * ```
 */

import {
  TranslationOptions,
  TranslationResult,
  TranslationError,
  TranslatorProvider,
  TranslationLibraryConfig,
  LanguageInfo,
  SUPPORTED_LANGUAGES,
  LANGUAGE_CODES,
  normalizeLanguageCode,
  isValidLanguageCode,
} from './types';
import { BaseTranslator } from './translators/base';
import { GoogleTranslator } from './translators/google';
import { YandexTranslator } from './translators/yandex';
import { LibreTranslator } from './translators/libre';

/**
 * Фабрика для создания переводчиков
 */
function createTranslator(provider: TranslatorProvider, config: TranslationLibraryConfig): BaseTranslator {
  switch (provider) {
    case 'google':
      return new GoogleTranslator({
        apiKey: config.apiKey,
        endpoint: config.endpoint,
        timeout: config.timeout,
        retries: config.retries,
      });
    case 'yandex':
      return new YandexTranslator({
        apiKey: config.apiKey,
        endpoint: config.endpoint,
        timeout: config.timeout,
        retries: config.retries,
      });
    case 'libre':
      return new LibreTranslator({
        apiKey: config.apiKey,
        endpoint: config.endpoint,
        timeout: config.timeout,
        retries: config.retries,
      });
    default:
      throw new TranslationError(
        `Unknown provider: ${provider}`,
        provider
      );
  }
}

/**
 * Основная библиотека перевода
 */
export class TranslationLibrary {
  private readonly translator: BaseTranslator;

  constructor(config: TranslationLibraryConfig) {
    this.translator = createTranslator(config.provider, config);
  }

  /**
   * Выполняет перевод текста
   * @param text Текст для перевода
   * @param targetLanguage Целевой язык
   * @param options Дополнительные опции
   * @returns Результат перевода
   * 
   * @example
   * ```typescript
   * const result = await translator.translate('Hello, world!', 'ru');
   * console.log(result.text); // Привет, мир!
   * ```
   */
  async translate(
    text: string,
    targetLanguage: string,
    options?: Partial<TranslationOptions>
  ): Promise<TranslationResult> {
    const translationOptions: TranslationOptions = {
      targetLanguage,
      sourceLanguage: options?.sourceLanguage,
      provider: options?.provider || this.translator.provider,
      chunkSize: options?.chunkSize,
      apiKey: options?.apiKey || this.translator.apiKey,
      endpoint: options?.endpoint || this.translator.endpoint,
      timeout: options?.timeout || this.translator.timeout,
      retries: options?.retries || this.translator.retries,
    };

    return await this.translator.translate(text, translationOptions);
  }

  /**
   * Определяет язык текста
   * @param text Текст для определения языка
   * @returns Код языка
   * 
   * @example
   * ```typescript
   * const lang = await translator.detectLanguage('Bonjour le monde');
   * console.log(lang); // fr
   * ```
   */
  async detectLanguage(text: string): Promise<string> {
    return await this.translator.detectLanguage(text);
  }

  /**
   * Получает список поддерживаемых языков
   * @returns Список языков
   * 
   * @example
   * ```typescript
   * const languages = await translator.getSupportedLanguages();
   * console.log(languages); // ['en', 'ru', 'de', ...]
   * ```
   */
  async getSupportedLanguages(): Promise<string[]> {
    return await this.translator.getSupportedLanguages();
  }

  /**
   * Получает информацию о текущем провайдере
   * @returns Информация о провайдере
   */
  getProviderInfo(): {
    provider: TranslatorProvider;
    hasApiKey: boolean;
    hasEndpoint: boolean;
  } {
    return {
      provider: this.translator.provider,
      hasApiKey: !!this.translator.apiKey,
      hasEndpoint: !!this.translator.endpoint,
    };
  }
}

// Экспорт типов
export {
  TranslationOptions,
  TranslationResult,
  TranslationError,
  TranslatorProvider,
  TranslationLibraryConfig,
  LanguageInfo,
  SUPPORTED_LANGUAGES,
  LANGUAGE_CODES,
  normalizeLanguageCode,
  isValidLanguageCode,
};

export { BaseTranslator } from './translators/base';
export { GoogleTranslator } from './translators/google';
export { YandexTranslator } from './translators/yandex';
export { LibreTranslator } from './translators/libre';

export {
  chunkText,
  splitBySentences,
  mergeChunks,
  chunkWithLinks,
  restoreTextWithLinks,
  normalizeText,
  isValidText,
} from './chunker';