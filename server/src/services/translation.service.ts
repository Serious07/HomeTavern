/**
 * Translation Service - Per-user translation with flexible provider support
 * Each user can configure their own provider and display language
 */

import db from '../config/database';
import { TranslationLibrary, TranslationLibraryConfig } from 'translation-library';
import { llmService } from './llm.service';
import { heroVariationRepository } from '../repositories/hero.variation.repository';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UserTranslationSettings {
  enabled: boolean;
  provider: 'google' | 'yandex' | 'libre' | 'llm';
  displayLang: string;
  libreEndpoint: string;
  autoTranslate: boolean;
  llmSystemPrompt?: string;
}

export interface TranslationServiceInstance {
  service: TranslationLibrary;
  settings: UserTranslationSettings;
  timestamp: number;
}

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

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: UserTranslationSettings = {
  enabled: true,
  provider: 'google',
  displayLang: 'ru',
  libreEndpoint: '',
  autoTranslate: true,
};

// ─── 1.1: getUserTranslationSettings ────────────────────────────────────────

function getUserTranslationSettings(userId: number): UserTranslationSettings {
  const rows = db.prepare(
    'SELECT key, value FROM settings WHERE user_id = ?'
  ).all(userId) as Array<{ key: string; value: string | null }>;

  const map: Record<string, string | null> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  return {
    enabled: map['translation_enabled'] !== 'false', // default true
    provider: (map['translation_provider'] as 'google' | 'yandex' | 'libre' | 'llm') || 'google',
    displayLang: map['translation_display_lang'] || 'ru',
    libreEndpoint: map['translation_libre_endpoint'] || '',
    autoTranslate: map['translation_auto_translate'] !== 'false', // default true
    llmSystemPrompt: map['translation_llm_system_prompt'] || undefined,
  };
}

// ─── 1.2: Service Cache with TTL ────────────────────────────────────────────

class ServiceCache {
  private cache: Map<number, TranslationServiceInstance> = new Map();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  get(userId: number): TranslationServiceInstance | undefined {
    const entry = this.cache.get(userId);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.TTL_MS) {
      this.cache.delete(userId);
      return undefined;
    }
    return entry;
  }

  set(userId: number, service: TranslationLibrary, settings: UserTranslationSettings): void {
    this.cache.set(userId, {
      service,
      settings,
      timestamp: Date.now(),
    });
  }

  invalidate(userId: number): void {
    this.cache.delete(userId);
  }

  clear(): void {
    this.cache.clear();
  }
}

const serviceCache = new ServiceCache();

// ─── 1.3: Factory createTranslationService ──────────────────────────────────

function buildLibrary(settings: UserTranslationSettings, userId?: number): TranslationLibrary {
  const config: any = {
    provider: settings.provider,
    timeout: 30000,
    retries: 3,
  };

  if (settings.provider === 'libre' && settings.libreEndpoint) {
    config.endpoint = settings.libreEndpoint;
  }

  if (settings.provider === 'llm' && settings.llmSystemPrompt) {
    config.systemPrompt = settings.llmSystemPrompt;
  }

  const library = new TranslationLibrary(config);

  if (settings.provider === 'llm' && userId) {
    const connection = llmService.getActiveConnection(userId);
    if (connection) {
      config.model = connection.model;
      const { LLMClient } = require('llm-client');
      const client = new LLMClient({
        baseURL: connection.base_url,
        apiKey: connection.api_key_decrypted,
        timeout: config.timeout || 60000,
      });
      (library as any).setLlmClient(client);
    } else {
      console.warn(`[TranslationService] No active LLM connection found for user ${userId}, falling back to defaults`);
    }
  }

  return library;
}

/**
 * Get or create a translation service for a specific user.
 * Uses cached instance with 5-min TTL.
 */
export function getTranslationService(userId: number): {
  library: TranslationLibrary;
  settings: UserTranslationSettings;
} {
  const cached = serviceCache.get(userId);
  if (cached) {
    return { library: cached.service, settings: cached.settings };
  }

  const settings = getUserTranslationSettings(userId);
  const library = buildLibrary(settings, userId);
  serviceCache.set(userId, library, settings);

  return { library, settings };
}

/**
 * Invalidate cached service for a user (call after settings change)
 */
export function invalidateServiceCache(userId: number): void {
  serviceCache.invalidate(userId);
}

/**
 * Clear all cached services
 */
export function clearServiceCache(): void {
  serviceCache.clear();
}

// ─── Text-level translation cache (in-memory) ───────────────────────────────

class TextTranslationCache {
  private cache: Map<string, { text: string; ts: number }> = new Map();
  private readonly MAX_SIZE = 2000;
  private readonly TTL_MS = 10 * 60 * 1000; // 10 minutes

  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > this.TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.text;
  }

  set(key: string, value: string): void {
    if (this.cache.size >= this.MAX_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, { text: value, ts: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

const textCache = new TextTranslationCache();

// ─── Language Detection (server-side, no API call) ──────────────────────────

/**
 * Detect language of text based on character analysis (no API call needed)
 */
export async function detectLanguage(text: string): Promise<string> {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return 'en';
  }

  const plainText = trimmedText
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[.*?\]/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/—/g, ' ')
    .trim();

  const russianWords = plainText.match(/[а-яА-ЯёЁ]+/g) || [];
  const englishWords = plainText.match(/[a-zA-Z]+/g) || [];

  const ruCount = russianWords.length;
  const enCount = englishWords.length;
  const total = ruCount + enCount;

  if (total === 0) {
    const hasCyrillic = /[а-яА-ЯёЁ]/.test(trimmedText);
    return hasCyrillic ? 'ru' : 'en';
  }

  const ruRatio = ruCount / total;
  const enRatio = enCount / total;

  if (enRatio > ruRatio) {
    return 'en';
  } else if (ruRatio > enRatio) {
    return 'ru';
  } else {
    return total > 4 ? 'ru' : 'en';
  }
}

// ─── 1.4 / 1.5: Universal translate method ──────────────────────────────────

/**
 * Replace {{user}}, {{User}}, {user}, {User} placeholders with the actual hero name.
 */
function replaceUserPlaceholders(text: string, heroName: string): string {
  return text
    .replace(/\{\{user\}\}/gi, heroName)   // {{user}} / {{User}} (case-insensitive)
    .replace(/\{user\}/gi, heroName);       // {user} / {User} (case-insensitive)
}

/**
 * Universal translate: translate text from sourceLang to targetLang using user's configured provider.
 * Before translation, replaces {{user}}, {{User}}, {user}, {User} with the actual hero name.
 * This replaces the old translateToEnglish() and translateToRussian() methods.
 */
export async function translateForUser(
  userId: number,
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  if (!text || !text.trim()) {
    return text;
  }

  if (sourceLang === targetLang) {
    return text;
  }

  // Get the active hero display_name for this user (use display_name, fallback to name)
  const activeHero = heroVariationRepository.getActiveHeroVariationByUserId(userId);
  const heroName = activeHero ? (activeHero.display_name || activeHero.name) : '';

  // Replace placeholders with the actual hero name BEFORE translation
  let processedText = text;
  if (heroName) {
    processedText = replaceUserPlaceholders(text, heroName);
  }

  // Check text cache
  const cacheKey = `${sourceLang}->${targetLang}:${processedText}`;
  const cached = textCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const { library } = getTranslationService(userId);

  try {
    const result = await library.translate(processedText, targetLang, {
      sourceLanguage: sourceLang,
    });
    const translatedText = result.text || processedText;

    // Save to cache
    textCache.set(cacheKey, translatedText);

    return translatedText;
  } catch (error) {
    console.error(`[TranslationService] translateForUser (${sourceLang}->${targetLang}) ERROR:`, error);
    return processedText; // Fallback: return processed original
  }
}

/**
 * Clear text translation cache
 */
export function clearTextCache(): void {
  textCache.clear();
}

// ─── 1.6: Legacy exports for backward compatibility ─────────────────────────

// Keep the old singleton-style exports for gradual migration
// These will be removed once all routes are migrated to per-user services.

class TranslationCache {
  private cache: Map<string, string> = new Map();
  private readonly MAX_SIZE = 1000;

  get(key: string): string | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: string): void {
    if (this.cache.size >= this.MAX_SIZE) {
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
  private translationLibrary: any;

  constructor() {
    this.provider = process.env.TRANSLATION_PROVIDER || 'google';
    this.apiKey = process.env.TRANSLATION_API_KEY || null;
    this.cache = new TranslationCache();

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

  async detectLanguage(text: string): Promise<string> {
    return detectLanguage(text);
  }

  async translateToEnglish(text: string): Promise<string> {
    if (!text || !text.trim()) return text;

    const cacheKey = `ru->en:${text}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    let translatedText: string;

    if (this.translationLibrary) {
      try {
        const result = await this.translationLibrary.translate(text, 'en', {
          sourceLanguage: 'ru',
        });
        translatedText = result.text || result.translatedText || text;
      } catch (error) {
        console.error('[TranslationService] translateToEnglish ERROR:', error);
        translatedText = text;
      }
    } else {
      translatedText = text;
    }

    this.cache.set(cacheKey, translatedText);
    return translatedText;
  }

  async translateToRussian(text: string): Promise<string> {
    if (!text || !text.trim()) return text;

    const cacheKey = `en->ru:${text}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    let translatedText: string;

    if (this.translationLibrary) {
      try {
        const result = await this.translationLibrary.translate(text, 'ru', {
          sourceLanguage: 'en',
        });
        translatedText = result.text || result.translatedText || text;
      } catch (error) {
        console.error('[TranslationService] translateToRussian ERROR:', error);
        translatedText = text;
      }
    } else {
      translatedText = text;
    }

    this.cache.set(cacheKey, translatedText);
    return translatedText;
  }

  async translate(
    text: string,
    options: TranslationOptions = {},
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

  private async translateToLanguage(
    text: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    if (sourceLang === 'ru' && targetLang === 'en') {
      return this.translateToEnglish(text);
    }
    if (sourceLang === 'en' && targetLang === 'ru') {
      return this.translateToRussian(text);
    }

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

  async getSupportedLanguages(): Promise<string[]> {
    return ['en', 'ru', 'es', 'fr', 'de', 'ja', 'zh', 'pt', 'it', 'ko'];
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton for backward compatibility
export const translationService = new TranslationService();