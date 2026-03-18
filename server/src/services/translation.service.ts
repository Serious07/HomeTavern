/**
 * Translation Service - Integration with translation-library
 * Provides translation between Russian and English with caching
 */

export interface TranslationOptions {
  sourceLang?: string;
  targetLang?: string;
  format?: 'text' | 'html' | 'markdown';
}

export interface TranslationResult {
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  confidence?: number;
}

/**
 * Простое кэширование переводов в памяти
 */
class TranslationCache {
  private cache: Map<string, string> = new Map();
  private readonly MAX_SIZE = 1000;

  get(key: string): string | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: string): void {
    if (this.cache.size >= this.MAX_SIZE) {
      // Удаляем первый элемент при достижении лимита
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

export class TranslationService {
  private provider: string;
  private apiKey: string | null;
  private cache: TranslationCache;
  private translationLibrary: any; // TranslationLibrary instance

  constructor() {
    this.provider = process.env.TRANSLATION_PROVIDER || 'google';
    this.apiKey = process.env.TRANSLATION_API_KEY || null;
    this.cache = new TranslationCache();

    // Инициализация TranslationLibrary
    try {
      const { TranslationLibrary } = require('translation-library');
      this.translationLibrary = new TranslationLibrary({
        provider: this.provider,
        apiKey: this.apiKey,
      });
      console.log('[TranslationService] Initialized with provider:', this.provider);
    } catch (error) {
      console.warn('[TranslationService] translation-library not installed. Using fallback implementation.');
      this.translationLibrary = null;
    }
  }

  /**
   * Определение языка текста
   * @param text - Текст для анализа
   * @returns Код языка ('ru', 'en' или другой)
   */
  async detectLanguage(text: string): Promise<string> {
    // Простая эвристика для определения языка
    const trimmedText = text.trim();
    if (!trimmedText) {
      console.log('[TranslationService] detectLanguage: empty text, returning "en"');
      return 'en';
    }

    // Если есть кириллица - скорее всего русский
    const hasCyrillic = /[а-яА-ЯёЁ]/.test(trimmedText);
    if (hasCyrillic) {
      console.log('[TranslationService] detectLanguage: detected Russian (cyrillic)');
      return 'ru';
    }

    // Если есть только латиница - английский
    const hasLatin = /[a-zA-Z]/.test(trimmedText);
    if (hasLatin) {
      console.log('[TranslationService] detectLanguage: detected English (latin)');
      return 'en';
    }

    // По умолчанию английский
    console.log('[TranslationService] detectLanguage: defaulting to English');
    return 'en';
  }

  /**
   * Перевод текста с русского на английский
   * @param text - Текст на русском языке
   * @returns Переведённый текст на английском
   */
  async translateToEnglish(text: string): Promise<string> {
    if (!text || !text.trim()) {
      console.log('[TranslationService] translateToEnglish: empty text, returning as-is');
      return text;
    }

    console.log('[TranslationService] translateToEnglish: START -', text.substring(0, 50) + (text.length > 50 ? '...' : ''));

    // Проверяем кэш
    const cacheKey = `ru->en:${text}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log('[TranslationService] translateToEnglish: CACHE HIT');
      return cached;
    }

    let translatedText: string;

    if (this.translationLibrary) {
      console.log('[TranslationService] translateToEnglish: using translation-library');
      try {
        const result = await this.translationLibrary.translate(text, 'en', {
          sourceLanguage: 'ru',
        });
        translatedText = result.text || result.translatedText || text;
        console.log('[TranslationService] translateToEnglish: SUCCESS -', translatedText.substring(0, 50) + (translatedText.length > 50 ? '...' : ''));
      } catch (error) {
        console.error('[TranslationService] translateToEnglish ERROR:', error);
        translatedText = text; // Fallback: возвращаем оригинал
      }
    } else {
      // Fallback: простая эмуляция (в реальности нужен реальный перевод)
      console.log('[TranslationService] translateToEnglish: using FALLBACK (library not available)');
      translatedText = text; // Placeholder
    }

    // Сохраняем в кэш
    this.cache.set(cacheKey, translatedText);
    console.log('[TranslationService] translateToEnglish: COMPLETED');

    return translatedText;
  }

  /**
   * Перевод текста с английского на русский
   * @param text - Текст на английском языке
   * @returns Переведённый текст на русском
   */
  async translateToRussian(text: string): Promise<string> {
    if (!text || !text.trim()) {
      console.log('[TranslationService] translateToRussian: empty text, returning as-is');
      return text;
    }

    console.log('[TranslationService] translateToRussian: START -', text.substring(0, 50) + (text.length > 50 ? '...' : ''));

    // Проверяем кэш
    const cacheKey = `en->ru:${text}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log('[TranslationService] translateToRussian: CACHE HIT');
      return cached;
    }

    let translatedText: string;

    if (this.translationLibrary) {
      console.log('[TranslationService] translateToRussian: using translation-library');
      try {
        const result = await this.translationLibrary.translate(text, 'ru', {
          sourceLanguage: 'en',
        });
        translatedText = result.text || result.translatedText || text;
        console.log('[TranslationService] translateToRussian: SUCCESS -', translatedText.substring(0, 50) + (translatedText.length > 50 ? '...' : ''));
      } catch (error) {
        console.error('[TranslationService] translateToRussian ERROR:', error);
        translatedText = text; // Fallback: возвращаем оригинал
      }
    } else {
      // Fallback: простая эмуляция (в реальности нужен реальный перевод)
      console.log('[TranslationService] translateToRussian: using FALLBACK (library not available)');
      translatedText = text; // Placeholder
    }

    // Сохраняем в кэш
    this.cache.set(cacheKey, translatedText);
    console.log('[TranslationService] translateToRussian: COMPLETED');

    return translatedText;
  }

  /**
   * Универсальный метод перевода
   * @param text - Текст для перевода
   * @param options - Опции перевода
   * @returns Результат перевода
   */
  async translate(
    text: string,
    options: TranslationOptions = {}
  ): Promise<TranslationResult> {
    const sourceLang = options.sourceLang || (await this.detectLanguage(text));
    const targetLang = options.targetLang || 'en';

    if (sourceLang === targetLang) {
      return {
        translatedText: text,
        sourceLang,
        targetLang,
        confidence: 1.0,
      };
    }

    const translatedText = await this.translateToLanguage(text, sourceLang, targetLang);

    return {
      translatedText,
      sourceLang,
      targetLang,
      confidence: 0.9,
    };
  }

  /**
   * Перевод в указанную целевую языковую локаль
   */
  private async translateToLanguage(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<string> {
    // Основной поток: ru <-> en
    if (sourceLang === 'ru' && targetLang === 'en') {
      return this.translateToEnglish(text);
    }
    if (sourceLang === 'en' && targetLang === 'ru') {
      return this.translateToRussian(text);
    }

    // Для других языков используем библиотеку или возвращаем оригинал
    if (this.translationLibrary) {
      try {
        const result = await this.translationLibrary.translate(text, targetLang, {
          sourceLanguage: sourceLang,
        });
        return result.text || result.translatedText || text;
      } catch (error) {
        console.error(`Translation error (${sourceLang}->${targetLang}):`, error);
        return text;
      }
    }

    return text;
  }

  /**
   * Получение поддерживаемых языков
   */
  async getSupportedLanguages(): Promise<string[]> {
    return ['en', 'ru', 'es', 'fr', 'de', 'ja', 'zh', 'pt', 'it', 'ko'];
  }

  /**
   * Очистка кэша переводов
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const translationService = new TranslationService();
