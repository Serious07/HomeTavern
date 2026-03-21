/**
 * System Prompts Routes - API endpoints для работы с системными промптами
 */

import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { systemPromptService, SystemPromptServiceError } from '../services/system-prompt.service';
import { SystemPrompt } from '../repositories/system-prompt.repository';

const router = Router();

// Все роуты требуют аутентификации
router.use(authenticate);

/**
 * GET /api/system-prompts
 * Получение списка всех системных промптов пользователя
 * 
 * Ответ:
 * {
 *   systemPrompts: SystemPrompt[]
 * }
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const systemPrompts = systemPromptService.getAllSystemPrompts(userId);
    res.status(200).json({ systemPrompts });
  } catch (error) {
    console.error('[SystemPromptsRoutes] Error getting system prompts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/system-prompts/active
 * Получение активного системного промпта пользователя
 * 
 * Ответ:
 * {
 *   systemPrompt: SystemPrompt | null
 * }
 */
router.get('/active', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const systemPrompt = systemPromptService.getActiveSystemPrompt(userId);
    res.status(200).json({ systemPrompt });
  } catch (error) {
    console.error('[SystemPromptsRoutes] Error getting active system prompt:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/system-prompts/:id
 * Получение системного промпта по ID
 * 
 * Ответ:
 * {
 *   systemPrompt: SystemPrompt
 * }
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid system prompt ID' });
    }

    const systemPrompt = systemPromptService.getSystemPrompt(id, userId);
    
    if (!systemPrompt) {
      return res.status(404).json({ error: 'System prompt not found' });
    }

    res.status(200).json({ systemPrompt });
  } catch (error) {
    if (error instanceof SystemPromptServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[SystemPromptsRoutes] Error getting system prompt:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/system-prompts
 * Создание нового системного промпта
 * 
 * Body:
 * {
 *   name: string;
 *   description?: string | null;
 *   prompt_text: string;
 *   is_active?: number;
 * }
 * 
 * Ответ:
 * {
 *   systemPrompt: SystemPrompt
 * }
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, description, prompt_text, is_active } = req.body;

    // Валидация: name и prompt_text должны быть строками (пустые строки разрешены)
    if (typeof name !== 'string' || typeof prompt_text !== 'string') {
      return res.status(400).json({ error: 'Name and prompt_text are required and must be strings' });
    }

    const systemPrompt = systemPromptService.createSystemPrompt(userId, {
      name,
      description: description ?? null,
      prompt_text,
      is_active: is_active ?? 0,
    });

    res.status(201).json({ systemPrompt });
  } catch (error) {
    console.error('[SystemPromptsRoutes] Error creating system prompt:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/system-prompts/:id
 * Обновление системного промпта
 * 
 * Body:
 * {
 *   name?: string;
 *   description?: string | null;
 *   prompt_text?: string;
 * }
 * 
 * Ответ:
 * {
 *   systemPrompt: SystemPrompt
 * }
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = parseInt(req.params.id, 10);
    const { name, description, prompt_text } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid system prompt ID' });
    }

    const updateData: {
      name?: string;
      description?: string | null;
      prompt_text?: string;
    } = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (prompt_text !== undefined) updateData.prompt_text = prompt_text;

    const systemPrompt = systemPromptService.updateSystemPrompt(id, userId, updateData);
    res.status(200).json({ systemPrompt });
  } catch (error) {
    if (error instanceof SystemPromptServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[SystemPromptsRoutes] Error updating system prompt:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/system-prompts/:id
 * Удаление системного промпта
 * 
 * Ответ:
 * {
 *   message: string
 * }
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid system prompt ID' });
    }

    systemPromptService.deleteSystemPrompt(id, userId);
    res.status(200).json({ message: 'System prompt deleted successfully' });
  } catch (error) {
    if (error instanceof SystemPromptServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[SystemPromptsRoutes] Error deleting system prompt:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/system-prompts/:id/activate
 * Активация системного промпта (установка активным)
 * 
 * Ответ:
 * {
 *   systemPrompt: SystemPrompt
 * }
 */
router.put('/:id/activate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid system prompt ID' });
    }

    const systemPrompt = systemPromptService.activateSystemPrompt(id, userId);
    res.status(200).json({ systemPrompt });
  } catch (error) {
    if (error instanceof SystemPromptServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[SystemPromptsRoutes] Error activating system prompt:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/system-prompts/migrate
 * Миграция system_prompt из таблицы characters в таблицу system_prompts
 * 
 * Ответ:
 * {
 *   migratedCount: number;
 *   errors: Array<{ characterId: number; characterName: string; error: string }>;
 * }
 */
router.post('/migrate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const result = systemPromptService.migrateSystemPrompts(userId);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof SystemPromptServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[SystemPromptsRoutes] Error running migration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
