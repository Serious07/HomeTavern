import { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { heroVariationRepository } from '../repositories/hero.variation.repository';
import { CreateHeroVariationInput, UpdateHeroVariationInput } from '../types';

const router = Router();

// GET /api/hero - Получить все вариации героя текущего пользователя
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const heroVariations = heroVariationRepository.getHeroVariationsByUserId(userId);
    res.json(heroVariations);
  } catch (error) {
    console.error('Error getting hero variations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/hero/active - Получить активную вариацию героя
router.get('/active', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const heroVariation = heroVariationRepository.getActiveHeroVariationByUserId(userId);
    if (!heroVariation) {
      return res.status(404).json({ error: 'Active hero variation not found' });
    }
    res.json(heroVariation);
  } catch (error) {
    console.error('Error getting active hero variation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/hero/profile - Получить профиль героя для LLM
router.get('/profile', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const profile = heroVariationRepository.getHeroProfileForLLM(userId);
    res.json({ profile });
  } catch (error) {
    console.error('Error getting hero profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/hero - Создать новую вариацию героя
router.post('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const body = req.body as CreateHeroVariationInput;
    
    const data: CreateHeroVariationInput = {
      user_id: userId,
      name: body.name,
      description: body.description,
      avatar: body.avatar,
      is_active: body.is_active ?? false,
    };

    const heroVariation = heroVariationRepository.createHeroVariation(data);
    res.status(201).json(heroVariation);
  } catch (error) {
    console.error('Error creating hero variation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/hero/:id - Обновить вариацию героя
router.put('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const heroVariationId = parseInt(req.params.id, 10);
    
    // Проверка, что вариация принадлежит пользователю
    const existing = heroVariationRepository.getHeroVariationById(heroVariationId);
    if (!existing || existing.user_id !== userId) {
      return res.status(404).json({ error: 'Hero variation not found' });
    }

    const body = req.body as UpdateHeroVariationInput;
    const heroVariation = heroVariationRepository.updateHeroVariation(heroVariationId, body);
    res.json(heroVariation);
  } catch (error) {
    console.error('Error updating hero variation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/hero/:id/activate - Установить активную вариацию героя
router.put('/:id/activate', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const heroVariationId = parseInt(req.params.id, 10);
    
    // Проверка, что вариация принадлежит пользователю
    const existing = heroVariationRepository.getHeroVariationById(heroVariationId);
    if (!existing || existing.user_id !== userId) {
      return res.status(404).json({ error: 'Hero variation not found' });
    }

    const heroVariation = heroVariationRepository.setActiveHeroVariation(userId, heroVariationId);
    res.json(heroVariation);
  } catch (error) {
    console.error('Error activating hero variation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/hero/:id - Удалить вариацию героя
router.delete('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const heroVariationId = parseInt(req.params.id, 10);
    
    // Проверка, что вариация принадлежит пользователю
    const existing = heroVariationRepository.getHeroVariationById(heroVariationId);
    if (!existing || existing.user_id !== userId) {
      return res.status(404).json({ error: 'Hero variation not found' });
    }

    const deleted = heroVariationRepository.deleteHeroVariation(heroVariationId);
    if (!deleted) {
      return res.status(404).json({ error: 'Hero variation not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting hero variation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/hero - Обновить профиль героя (совместимость с старым API)
router.put('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const body = req.body;
    
    // Проверяем, есть ли уже активная вариация
    const activeVariation = heroVariationRepository.getActiveHeroVariationByUserId(userId);
    
    if (activeVariation) {
      // Обновляем существующую активную вариацию
      const heroVariation = heroVariationRepository.updateHeroVariation(activeVariation.id, {
        name: body.name,
        description: body.description,
      });
      res.json(heroVariation);
    } else {
      // Создаем новую вариацию
      const data: CreateHeroVariationInput = {
        user_id: userId,
        name: body.name,
        description: body.description,
        is_active: true,
      };
      const heroVariation = heroVariationRepository.createHeroVariation(data);
      res.status(201).json(heroVariation);
    }
  } catch (error) {
    console.error('Error updating hero:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
