import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import {
  translateForUser,
  detectLanguage,
  getTranslationService,
  invalidateServiceCache,
} from '../services/translation.service';
import { LlmTranslator } from 'translation-library';
import { llmService } from '../services/llm.service';
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
      llmSystemPrompt: settings.llmSystemPrompt,
      llmReasoning: settings.llmReasoning,
    });
  } catch (error) {
    console.error('[TranslateRoute] Error getting settings:', error);
    res.status(500).json({ error: 'Failed to get translation settings' });
  }
});

/**
 * PUT /api/translate/settings
 * Обновить настройки перевода пользователя
 * Body: { provider?, displayLang?, enabled?, libreEndpoint?, autoTranslate?, llmSystemPrompt? }
 */
router.put('/settings', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { provider, displayLang, enabled, libreEndpoint, autoTranslate, llmSystemPrompt, llmReasoning } = req.body;

    const validProviders = ['google', 'yandex', 'libre', 'llm'];

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

    if (llmSystemPrompt !== undefined) {
      saveSetting('translation_llm_system_prompt', String(llmSystemPrompt));
    }

    if (llmReasoning !== undefined) {
      saveSetting('translation_llm_reasoning', String(llmReasoning));
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
      llmSystemPrompt: settings.llmSystemPrompt,
      llmReasoning: settings.llmReasoning,
    });
  } catch (error) {
    console.error('[TranslateRoute] Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update translation settings' });
  }
});

/**
 * POST /api/translate/stream
 * SSE streaming translation using LLM
 *
 * Request body:
 * {
 *   text: string;
 *   targetLang: string;
 *   sourceLang?: string;
 * }
 *
 * Response: SSE stream with tokens
 */
router.post('/stream', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { text, targetLang, sourceLang } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Text is required and must be a string',
      });
    }

    if (!targetLang || typeof targetLang !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Target language is required',
      });
    }

    const srcLang = sourceLang || (await detectLanguage(text));
    if (srcLang === targetLang) {
      // Send the text as-is in SSE format
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify({ token: text })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, fullText: text })}\n\n`);
      return res.end();
    }

    const { settings } = getTranslationService(userId);

    if (!settings.enabled) {
      return res.status(403).json({
        error: 'Translation is disabled',
      });
    }

    // Only LLM provider supports streaming
    if (settings.provider !== 'llm') {
      return res.status(400).json({
        error: 'Streaming not supported',
        message: 'Streaming translation is only available with LLM provider',
      });
    }

    // Read llmReasoning directly from DB to avoid stale cache issues
    // This ensures the edit message modal respects the latest reasoning setting
    const reasoningRow = db.prepare(
      "SELECT value FROM settings WHERE user_id = ? AND key = 'translation_llm_reasoning'"
    ).get(userId) as { value?: string | null } | undefined;
    const llmReasoning = reasoningRow?.value !== 'false'; // default true if not set

    console.log(`[TranslateRoute] Starting streaming translation: "${text.substring(0, 50)}..." ${sourceLang} -> ${targetLang}`);
    console.log(`[TranslateRoute] llmReasoning from DB: ${llmReasoning} (cached settings: ${settings.llmReasoning})`);

    // Create LLM translator for streaming
    // Inject the server's LLMClient so it uses the active connection
    const llmTranslator = new LlmTranslator({
      systemPrompt: settings.llmSystemPrompt,
      timeout: 300000, // 5 минут — модели с reasoning могут долго думать
      reasoning: llmReasoning, // Use fresh value from DB, not cached
    });
    
     // Inject the LLMClient from the server's llmService
     // This ensures we use the active database connection (correct base_url, api_key, model)
     try {
       const connection = llmService.getActiveConnection(userId);
       if (connection) {
         console.log(`[TranslateRoute] Found active connection: ${connection.base_url}`);
         const { LLMClient } = require('llm-client');
         const injectedClient = new LLMClient({
           baseURL: connection.base_url,
           apiKey: connection.api_key_decrypted,
           timeout: 900000,
         });
         llmTranslator.setLlmClient(injectedClient);
       } else {
         console.warn(`[TranslateRoute] No active LLM connection found for user ${userId}, falling back to defaults`);
       }
     } catch (error) {
       console.error('[TranslateRoute] Error injecting LLMClient:', error);
     }

    // Set up SSE response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let fullText = '';
    const stream = llmTranslator.translateStream(text, {
      sourceLanguage: srcLang,
      targetLanguage: targetLang,
    });

    // Keep-alive таймер: отправляет SSE комментарии каждую секунду
    // чтобы HTTP-соединение не прерывалось во время длинных пауз
    // (например, когда модель генерирует reasoning токены)
    let lastActivity = Date.now();
    const keepAliveTimer = setInterval(() => {
      if (!res.writableEnded && Date.now() - lastActivity > 5000) {
        // SSE comment — игнорируется клиентом, но держит соединение живым
        try { res.write(': keepalive\n\n'); } catch { /* ignore */ }
      }
    }, 1000);

    try {
      for await (const chunk of stream) {
        if (res.writableEnded) break; // Client disconnected

        const c = chunk as any;
        if (c.done && c.fullText !== undefined) {
          fullText = c.fullText;
          lastActivity = Date.now();
          res.write(`data: ${JSON.stringify({ done: true, fullText })}\n\n`);
          res.end();
        } else if (c.isReasoning) {
          // Reasoning токен (мысли модели) — отправляем отдельно
          lastActivity = Date.now();
          res.write(`data: ${JSON.stringify({ reasoningToken: c.token })}\n\n`);
        } else if (c.token) {
          fullText += c.token;
          lastActivity = Date.now();
          res.write(`data: ${JSON.stringify({ token: c.token })}\n\n`);
        }
      }

      // If stream ended without done signal, send it
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ done: true, fullText })}\n\n`);
        res.end();
      }
    } catch (streamError) {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: 'Streaming failed', fullText })}\n\n`);
        res.end();
      }
      console.error('[TranslateRoute] Stream error:', streamError);
    } finally {
      clearInterval(keepAliveTimer);
    }
  } catch (error) {
    if (!res.headersSent) {
      console.error('[TranslateRoute] Stream setup error:', error);
      res.status(500).json({
        error: 'Translation failed',
        message: 'An error occurred during streaming translation',
      });
    }
  }
});

export default router;