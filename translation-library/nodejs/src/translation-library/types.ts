/**
 * Типы данных для библиотеки перевода
 */

/**
 * Поддерживаемые провайдеры перевода
 */
export type TranslatorProvider = 'google' | 'yandex' | 'libre';

/**
 * Информация о языке
 */
export interface LanguageInfo {
  code: string;
  name: string;
  nativeName?: string;
}

/**
 * Результат перевода
 */
export interface TranslationResult {
  /** Переведённый текст */
  text: string;
  /** Определённый исходный язык (если поддерживается провайдером) */
  sourceLanguage?: string;
  /** Использованный провайдер */
  provider: TranslatorProvider;
  /** Количество использованных токенов (если доступно) */
  tokensUsed?: number;
}

/**
 * Опции для перевода
 */
export interface TranslationOptions {
  /** Провайдер перевода */
  provider?: TranslatorProvider;
  /** Язык перевода */
  targetLanguage: string;
  /** Исходный язык (опционально, если не указано, будет определён автоматически) */
  sourceLanguage?: string;
  /** Максимальный размер чанка для разбивки текста */
  chunkSize?: number;
  /** API ключ для провайдера */
  apiKey?: string;
  /** Кастомный endpoint для self-hosted решений */
  endpoint?: string;
  /** Таймаут запроса в миллисекундах */
  timeout?: number;
  /** Количество попыток повторного запроса при ошибке */
  retries?: number;
}

/**
 * Конфигурация библиотеки
 */
export interface TranslationLibraryConfig {
  /** Провайдер перевода по умолчанию */
  provider: TranslatorProvider;
  /** API ключ для провайдера */
  apiKey?: string;
  /** Кастомный endpoint для self-hosted решений */
  endpoint?: string;
  /** Таймаут запроса в миллисекундах */
  timeout?: number;
  /** Количество попыток повторного запроса при ошибке */
  retries?: number;
}

/**
 * Ошибка перевода
 */
export class TranslationError extends Error {
  readonly provider: TranslatorProvider;
  readonly statusCode?: number;
  readonly details?: unknown;

  constructor(
    message: string,
    provider: TranslatorProvider,
    options?: {
      statusCode?: number;
      details?: unknown;
    }
  ) {
    super(message);
    this.name = 'TranslationError';
    this.provider = provider;
    this.statusCode = options?.statusCode;
    this.details = options?.details;
  }
}

/**
 * Коды языков (ISO 639-1 с расширениями)
 */
export const LANGUAGE_CODES: Record<string, string> = {
  // Специфичные коды для разных провайдеров
  'zh-CN': 'zh',
  'zh-TW': 'zh',
  'pt-BR': 'pt',
  'pt-PT': 'pt',
};

/**
 * Список поддерживаемых языков
 */
export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: 'af', name: 'Afrikaans' },
  { code: 'sq', name: 'Albanian' },
  { code: 'am', name: 'Amharic' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hy', name: 'Armenian' },
  { code: 'az', name: 'Azerbaijani' },
  { code: 'eu', name: 'Basque' },
  { code: 'be', name: 'Belarusian' },
  { code: 'bn', name: 'Bengali' },
  { code: 'bs', name: 'Bosnian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'ca', name: 'Catalan' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文' },
  { code: 'hr', name: 'Croatian' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'en', name: 'English' },
  { code: 'eo', name: 'Esperanto' },
  { code: 'et', name: 'Estonian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' },
  { code: 'gl', name: 'Galician' },
  { code: 'ka', name: 'Georgian' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'ht', name: 'Haitian Creole' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'is', name: 'Icelandic' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ga', name: 'Irish' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'jw', name: 'Javanese' },
  { code: 'kn', name: 'Kannada' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'km', name: 'Khmer' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'ku', name: 'Kurdish' },
  { code: 'ky', name: 'Kyrgyz' },
  { code: 'lo', name: 'Lao' },
  { code: 'la', name: 'Latin' },
  { code: 'lv', name: 'Latvian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'ms', name: 'Malay' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'mt', name: 'Maltese' },
  { code: 'mi', name: 'Maori' },
  { code: 'mr', name: 'Marathi' },
  { code: 'mn', name: 'Mongolian' },
  { code: 'my', name: 'Myanmar (Burmese)' },
  { code: 'ne', name: 'Nepali' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'pt-PT', name: 'Portuguese (Portugal)' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'sr', name: 'Serbian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'es', name: 'Spanish' },
  { code: 'sw', name: 'Swahili' },
  { code: 'sv', name: 'Swedish' },
  { code: 'tl', name: 'Tagalog (Filipino)' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'uz', name: 'Uzbek' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'cy', name: 'Welsh' },
  { code: 'yi', name: 'Yiddish' },
  { code: 'zu', name: 'Zulu' },
];

/**
 * Нормализация кода языка
 */
export function normalizeLanguageCode(code: string): string {
  const normalized = code.toLowerCase().trim();
  return LANGUAGE_CODES[normalized] || normalized;
}

/**
 * Проверка валидности кода языка
 */
export function isValidLanguageCode(code: string): boolean {
  const normalized = code.toLowerCase().trim();
  return SUPPORTED_LANGUAGES.some(lang => lang.code === normalized);
}