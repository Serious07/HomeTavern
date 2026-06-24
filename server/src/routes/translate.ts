import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import {
  translateForUser,
  detectLanguage,
  getTranslationService,
  invalidateServiceCache,
} from '../services/translation.service';
import db from '../config/database';

const router = Router();

// ─── 2.1 / 2.2: Auth middleware + per-user service ───────────────────────────

/**
 * POST /api/translate
 * Перевод текста с использованием per-user translation service
 *
 * Request body:
 * {
 *   text: string;          // Текст для перевода
 *   targetLang: string;    // Целевой язык (например, 'en', 'ru', 'ja')
 *   sourceLang?: string;   // Исходный язык (опционально, авто-детект если не указан)
 * }
 *
 * Response:
 * {
 *   translatedText: string; // Переведённый текст
 * }
 */
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { text, targetLang, sourceLang } = req.body;

    // Валидация входных данных
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Text is required and must be a string',
      });
    }

    if (!targetLang || typeof targetLang !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Target language (targetLang) is required and must be a string',
      });
    }

    // Determine source language
    const srcLang = sourceLang || (await detectLanguage(text));

    // If already in target language, return as-is
    if (srcLang === targetLang) {
      return res.json({ translatedText: text });
    }

    // Translate using user's configured provider
    const translatedText = await translateForUser(userId, text, srcLang, targetLang);

    res.json({
      translatedText,
    });
  } catch (error) {
    console.error('[TranslateRoute] Error:', error);
    res.status(500).json({
      error: 'Translation failed',
      message: 'An error occurred during translation',
    });
  }
});

/**
 * GET /api/translate/settings
 * Получить текущие настройки перевода пользователя
 */
router.get('/settings', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { settings } = getTranslationService(userId);

    res.json({
      enabled: settings.enabled,
      provider: settings.provider,
      displayLang: settings.displayLang,
      libreEndpoint: settings.libreEndpoint,
      autoTranslate: settings.autoTranslate,
    });
  } catch (error) {
    console.error('[TranslateRoute] Error getting settings:', error);
    res.status(500).json({ error: 'Failed to get translation settings' });
  }
});

/**
 * PUT /api/translate/settings
 * Обновить настройки перевода пользователя
 * Body: { provider?, displayLang?, enabled?, libreEndpoint?, autoTranslate? }
 */
router.put('/settings', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { provider, displayLang, enabled, libreEndpoint, autoTranslate } = req.body;

    const validProviders = ['google', 'yandex', 'libre'];

    // Save each setting to the database
    const saveSetting = (key: string, value: string | null) => {
      const stmt = db.prepare(`
        INSERT INTO settings (user_id, key, value, created_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `);
      stmt.run(userId, key, value);
    };

    if (provider !== undefined) {
      if (!validProviders.includes(provider)) {
        return res.status(400).json({
          error: 'Invalid provider',
          message: `Provider must be one of: ${validProviders.join(', ')}`,
        });
      }
      saveSetting('translation_provider', provider);
    }

    if (displayLang !== undefined) {
      saveSetting('translation_display_lang', String(displayLang));
    }

    if (enabled !== undefined) {
      saveSetting('translation_enabled', String(enabled));
    }

    if (libreEndpoint !== undefined) {
      saveSetting('translation_libre_endpoint', String(libreEndpoint));
    }

    if (autoTranslate !== undefined) {
      saveSetting('translation_auto_translate', String(autoTranslate));
    }

    // Invalidate cache so next translation uses new settings
    invalidateServiceCache(userId);

    // Return updated settings
    const { settings } = getTranslationService(userId);
    res.json({
      enabled: settings.enabled,
      provider: settings.provider,
      displayLang: settings.displayLang,
      libreEndpoint: settings.libreEndpoint,
      autoTranslate: settings.autoTranslate,
    });
  } catch (error) {
    console.error('[TranslateRoute] Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update translation settings' });
  }
});

export default router;
