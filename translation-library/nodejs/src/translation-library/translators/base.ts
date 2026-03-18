/**
 * Базовый класс для всех переводчиков
 */

import {
  TranslationOptions,
  TranslationResult,
  TranslationError,
  TranslatorProvider,
} from '../types';

/**
 * Базовый класс для всех переводчиков
 */
export abstract class BaseTranslator {
  readonly provider: TranslatorProvider;
  readonly apiKey?: string;
  readonly endpoint?: string;
  readonly timeout: number;
  readonly retries: number;

  constructor(config: {
    provider: TranslatorProvider;
    apiKey?: string;
    endpoint?: string;
    timeout?: number;
    retries?: number;
  }) {
    this.provider = config.provider;
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint;
    this.timeout = config.timeout || 30000; // 30 секунд по умолчанию
    this.retries = config.retries || 3;
  }

  /**
   * Выполняет перевод текста
   * @param text Текст для перевода
   * @param options Опции перевода
   * @returns Результат перевода
   */
  abstract translate(text: string, options: TranslationOptions): Promise<TranslationResult>;

  /**
   * Определяет язык текста (если поддерживается провайдером)
   * @param text Текст для определения языка
   * @returns Код языка
   */
  async detectLanguage(text: string): Promise<string> {
    throw new TranslationError(
      'Language detection is not supported by this translator',
      this.provider
    );
  }

  /**
   * Получает список поддерживаемых языков
   * @returns Список языков
   */
  async getSupportedLanguages(): Promise<string[]> {
    throw new TranslationError(
      'Getting supported languages is not supported by this translator',
      this.provider
    );
  }

  /**
   * Валидирует входные данные
   * @param text Текст для перевода
   * @param targetLanguage Целевой язык
   */
  protected validateInput(text: string, targetLanguage: string): void {
    // Приводим к строке и проверяем text
    const textValue = String(text ?? '');
    if (!textValue || textValue.trim().length === 0) {
      throw new TranslationError('Text cannot be empty', this.provider);
    }

    // Приводим к строке и проверяем targetLanguage
    const targetLangValue = String(targetLanguage ?? '');
    if (!targetLangValue || targetLangValue.trim().length === 0) {
      throw new TranslationError('Target language cannot be empty', this.provider);
    }
  }

  /**
   * Нормализует код языка
   * @param lang Код языка
   * @returns Нормализованный код языка
   */
  protected normalizeLanguageCode(lang: string): string {
    return lang.toLowerCase().trim();
  }

  /**
   * Выполняет запрос с повторными попытками
   * @param requestFn Функция запроса
   * @param attempt Номер попытки
   * @returns Результат запроса
   */
  protected async requestWithRetry<T>(
    requestFn: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error) {
      if (attempt < this.retries) {
        console.warn(
          `Translation request failed (attempt ${attempt}/${this.retries}), retrying...`
        );
        // Ждём перед повторной попыткой (экспоненциальная задержка)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.requestWithRetry(requestFn, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Создаёт объект ошибки перевода
   * @param message Сообщение об ошибке
   * @param statusCode Код статуса HTTP (если доступен)
   * @param details Дополнительные детали ошибки
   */
  protected createError(
    message: string,
    statusCode?: number,
    details?: unknown
  ): TranslationError {
    return new TranslationError(message, this.provider, { statusCode, details });
  }
}