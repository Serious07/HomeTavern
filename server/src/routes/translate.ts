import { Router, Request, Response } from 'express';
import { translationService } from '../services/translation.service';

const router = Router();

/**
 * POST /api/translate
 * Перевод текста с использованием translation service
 * 
 * Request body:
 * {
 *   text: string;       // Текст для перевода
 *   targetLang: string; // Целевой язык (например, 'en', 'ru')
 * }
 * 
 * Response:
 * {
 *   translatedText: string; // Переведённый текст
 * }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { text, targetLang } = req.body;

    // Валидация входных данных
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid request', 
        message: 'Text is required and must be a string' 
      });
    }

    if (!targetLang || typeof targetLang !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid request', 
        message: 'Target language (targetLang) is required and must be a string' 
      });
    }

    // Определение исходного языка
    const sourceLang = await translationService.detectLanguage(text);

    // Если язык уже совпадает с целевым, возвращаем оригинал
    if (sourceLang === targetLang) {
      return res.json({ translatedText: text });
    }

    // Выполнение перевода
    const result = await translationService.translate(text, {
      sourceLang,
      targetLang,
    });

    res.json({
      translatedText: result.translatedText,
    });
  } catch (error) {
    console.error('[TranslateRoute] Error:', error);
    res.status(500).json({ 
      error: 'Translation failed', 
      message: 'An error occurred during translation' 
    });
  }
});

export default router;
