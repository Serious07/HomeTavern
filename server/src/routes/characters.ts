import { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { characterService } from '../services/character.service';
import { CreateCharacterInput, UpdateCharacterInput, SillyTavernCharacter } from '../types';

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
    res.status(200).json(characters);
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
 * Body: { name: string, description?: string, personality?: string, first_message?: string, system_prompt?: string, avatar?: string }
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
 * Body: { name?: string, description?: string, personality?: string, first_message?: string, system_prompt?: string, avatar?: string }
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
 * Body: { name: string, description?: string, personality?: string, first_message?: string, system_prompt?: string }
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

export default router;
