import { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { characterService } from '../services/character.service';
import { characterRepository } from '../repositories/character.repository';
import { CreateCharacterInput, UpdateCharacterInput, SillyTavernCharacter, CharacterGreeting } from '../types';
import { llmService } from '../services/llm.service';

const router = Router();

// Все роуты требуют аутентификации
router.use(authenticate);

/**
 * GET /api/characters
 * Получение списка персонажей текущего пользователя
 */
router.get('/', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const characters = characterService.getAllCharacters(userId);
    
    // Добавляем количество приветствий к каждому персонажу
    const charactersWithGreetings = characters.map(character => ({
      ...character,
      greeting_count: characterRepository.getGreetingCountByCharacterId(character.id),
    }));
    
    res.status(200).json(charactersWithGreetings);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/characters/:id
 * Получение персонажа по ID
 */
router.get('/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const characterId = parseInt(req.params.id, 10);
    
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }
    
    const character = characterService.getCharacter(characterId, userId);
    
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    res.status(200).json(character);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/characters
 * Создание персонажа
 * Body: { name: string, description?: string, personality?: string, first_message?: string, avatar?: string }
 */
router.post('/', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data: Omit<CreateCharacterInput, 'user_id'> = req.body;
    
    console.log('[characters.post] Received body:', JSON.stringify(req.body, null, 2));
    console.log('[characters.post] User ID:', userId);
    console.log('[characters.post] Data keys:', Object.keys(data));
    
    // Проверка обязательных полей
    if (!data.name) {
      console.log('[characters.post] ERROR: name field is missing');
      return res.status(400).json({ error: 'Name field is required' });
    }
    
    const character = characterService.createCharacter(userId, data);
    res.status(201).json(character);
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    console.log('[characters.post] Error caught:', error_);
    const statusCode = error_.statusCode || 400;
    res.status(statusCode).json({ error: error_.message || 'Unknown error' });
  }
});

/**
 * PUT /api/characters/:id
 * Обновление персонажа
 * Body: { name?: string, description?: string, personality?: string, first_message?: string, avatar?: string }
 */
router.put('/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const characterId = parseInt(req.params.id, 10);
    const data: UpdateCharacterInput = req.body;
    
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }
    
    const character = characterService.updateCharacter(characterId, userId, data);
    
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    res.status(200).json(character);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/characters/:id
 * Удаление персонажа
 */
router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const characterId = parseInt(req.params.id, 10);
    
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }
    
    const deleted = characterService.deleteCharacter(characterId, userId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    res.status(200).json({ message: 'Character deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/characters/import
 * Импорт персонажа из SillyTavern формата
 * Body: { name: string, description?: string, personality?: string, first_message?: string }
 */
router.post('/import', (req: AuthenticatedRequest, res: Response) => {
  console.log('[characters.import] ENTER - POST /api/characters/import');
  console.log('[characters.import] User ID:', req.user?.userId);
  console.log('[characters.import] Raw body:', JSON.stringify(req.body, null, 2));
  
  try {
    const userId = req.user!.userId;
    const data: SillyTavernCharacter = req.body;
    
    console.log('[characters.import] Parsed data:', {
      name: data.name,
      has_first_mes: !!data.first_mes,
      first_mes_preview: data.first_mes?.substring(0, 50),
      has_data: !!data.data,
    });
    
    // Валидация JSON
    if (!data.name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const character = characterService.importCharacter(userId, data);
    res.status(201).json(character);
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    console.log('[characters.import] Error caught:', error_);
    const statusCode = error_.statusCode || 400;
    res.status(statusCode).json({ error: error_.message });
  }
});

// ==================== Character Greetings Routes ====================

/**
 * GET /api/characters/:id/greetings
 * Получение всех приветствий персонажа
 */
router.get('/:id/greetings', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const characterId = parseInt(req.params.id, 10);
    
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }
    
    const greetings = characterService.getAllGreetings(characterId, userId);
    res.status(200).json(greetings);
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    res.status((error_ as any).statusCode || 400).json({ error: (error_ as Error).message });
  }
});

/**
 * POST /api/characters/:id/greetings
 * Установка (создание/обновление) всех приветствий персонажа
 * Body: { greetings: string[] }
 */
router.post('/:id/greetings', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const characterId = parseInt(req.params.id, 10);
    const { greetings } = req.body;
    
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }
    
    if (!greetings || !Array.isArray(greetings)) {
      return res.status(400).json({ error: 'greetings array is required' });
    }
    
    const result = characterService.setGreetings(characterId, userId, greetings);
    res.status(200).json(result);
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    res.status((error_ as any).statusCode || 400).json({ error: (error_ as Error).message });
  }
});

/**
 * POST /api/characters/:id/greetings/add
 * Добавление нового приветствия
 * Body: { message: string }
 */
router.post('/:id/greetings/add', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const characterId = parseInt(req.params.id, 10);
    const { message } = req.body;
    
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }
    
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    
    const result = characterService.addGreeting(characterId, userId, message);
    res.status(201).json(result);
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    res.status((error_ as any).statusCode || 400).json({ error: (error_ as Error).message });
  }
});

/**
 * PUT /api/characters/greetings/:greetingId
 * Обновление конкретного приветствия
 * Body: { message: string }
 */
router.put('/greetings/:greetingId', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const greetingId = parseInt(req.params.greetingId, 10);
    const { message } = req.body;
    
    const result = characterService.updateGreeting(greetingId, userId, { message });
    
    if (!result) {
      return res.status(404).json({ error: 'Greeting not found' });
    }
    
    res.status(200).json(result);
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    res.status((error_ as any).statusCode || 400).json({ error: (error_ as Error).message });
  }
});

/**
 * DELETE /api/characters/greetings/:greetingId
 * Удаление конкретного приветствия
 */
router.delete('/greetings/:greetingId', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const greetingId = parseInt(req.params.greetingId, 10);
    
    const deleted = characterService.deleteGreeting(greetingId, userId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Greeting not found' });
    }
    
    res.status(200).json({ message: 'Greeting deleted successfully' });
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    res.status((error_ as any).statusCode || 400).json({ error: (error_ as Error).message });
  }
});

/**
 * PUT /api/characters/:id/active-greeting
 * Установка активного приветствия (по sort_order индексу)
 * Body: { sort_order: number }
 */
router.put('/:id/active-greeting', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const characterId = parseInt(req.params.id, 10);
    const { sort_order } = req.body;
    
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }
    
    if (sort_order === undefined) {
      return res.status(400).json({ error: 'sort_order is required' });
    }
    
    const result = characterService.setActiveGreeting(characterId, userId, sort_order);
    
    if (!result) {
      return res.status(404).json({ error: 'Greeting not found or character access denied' });
    }
    
    res.status(200).json(result);
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    res.status((error_ as any).statusCode || 400).json({ error: (error_ as Error).message });
  }
});

/**
 * PUT /api/characters/greetings/:greetingId/move
 * Перемещение приветствия (изменение sort_order)
 * Body: { sort_order: number }
 */
router.put('/greetings/:greetingId/move', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const greetingId = parseInt(req.params.greetingId, 10);
    const { sort_order } = req.body;
    
    if (sort_order === undefined) {
      return res.status(400).json({ error: 'sort_order is required' });
    }
    
    const result = characterService.moveGreeting(greetingId, userId, sort_order);
    
    if (!result) {
      return res.status(404).json({ error: 'Greeting not found' });
    }
    
    res.status(200).json(result);
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    res.status((error_ as any).statusCode || 400).json({ error: (error_ as Error).message });
  }
});

/**
 * POST /api/characters/generate-short-description
 * Генерация краткого описания персонажа через LLM
 * Body: { description: string }
 */
router.post('/generate-short-description', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { description } = req.body;

    if (!description || typeof description !== 'string') {
      return res.status(400).json({ error: 'Description field is required and must be a string' });
    }

    const prompt = `Create a short description (1-2 sentences) based on the following text.
Respond only in English.

If the text describes a character - describe its main features.
If the text describes a world, system, or game rules - describe the world as if the user is entering it (for example: "The user enters a world inhabited by...").

Text: ${description}`;

    const shortDescription = await llmService.generateFromPrompt(prompt);

    res.status(200).json({ short_description: shortDescription });
  } catch (error) {
    const error_ = error as Error & { statusCode?: number };
    console.error('[characters.generate-short-description] Error:', error_);
    const statusCode = (error_ as Error & { statusCode?: number }).statusCode || 500;
    res.status(statusCode).json({ error: error_.message || 'Internal server error' });
  }
});

export default router;
