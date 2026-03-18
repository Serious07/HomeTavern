import db from '../config/database';
import { HeroVariation, CreateHeroVariationInput, UpdateHeroVariationInput } from '../types';

class HeroVariationRepository {
  /**
   * Получить все вариации героя для пользователя
   */
  getHeroVariationsByUserId(userId: number): HeroVariation[] {
    const stmt = db.prepare(`
      SELECT * FROM hero_variations 
      WHERE user_id = ? 
      ORDER BY is_active DESC, created_at DESC
    `);
    return stmt.all(userId) as HeroVariation[];
  }

  /**
   * Получить активную вариацию героя для пользователя
   */
  getActiveHeroVariationByUserId(userId: number): HeroVariation | null {
    const stmt = db.prepare(`
      SELECT * FROM hero_variations 
      WHERE user_id = ? AND is_active = 1 
      LIMIT 1
    `);
    return stmt.get(userId) as HeroVariation | null;
  }

  /**
   * Получить вариацию героя по ID
   */
  getHeroVariationById(id: number): HeroVariation | null {
    const stmt = db.prepare(`
      SELECT * FROM hero_variations 
      WHERE id = ?
    `);
    return stmt.get(id) as HeroVariation | null;
  }

  /**
   * Создать новую вариацию героя
   */
  createHeroVariation(data: CreateHeroVariationInput): HeroVariation {
    const { user_id, name, description, avatar, is_active } = data;
    
    // Если is_active установлен, сначала отключить все остальные активные вариации
    if (is_active) {
      const deactivateStmt = db.prepare(`
        UPDATE hero_variations 
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP 
        WHERE user_id = ?
      `);
      deactivateStmt.run(user_id);
    }

    const stmt = db.prepare(`
      INSERT INTO hero_variations (user_id, name, description, avatar, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    
    const result = stmt.run(
      user_id,
      name,
      description || null,
      avatar || null,
      is_active ? 1 : 0
    );

    return this.getHeroVariationById(result.lastInsertRowid as number) as HeroVariation;
  }

  /**
   * Обновить вариацию героя
   */
  updateHeroVariation(id: number, data: UpdateHeroVariationInput): HeroVariation | null {
    const { name, description, avatar, is_active } = data;
    
    // Если is_active установлен, сначала отключить все остальные активные вариации
    if (is_active) {
      const updateStmt = db.prepare(`
        UPDATE hero_variations 
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP 
        WHERE user_id = (SELECT user_id FROM hero_variations WHERE id = ?) AND id != ?
      `);
      updateStmt.run(id, id);
    }

    const fields: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      fields.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      fields.push('description = ?');
      values.push(description);
    }
    if (avatar !== undefined) {
      fields.push('avatar = ?');
      values.push(avatar);
    }
    if (is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = db.prepare(`
      UPDATE hero_variations 
      SET ${fields.join(', ')} 
      WHERE id = ?
    `);
    
    stmt.run(...values);

    return this.getHeroVariationById(id);
  }

  /**
   * Установить активную вариацию героя
   */
  setActiveHeroVariation(userId: number, heroVariationId: number): HeroVariation | null {
    // Отключить все активные вариации для пользователя
    const deactivateStmt = db.prepare(`
      UPDATE hero_variations 
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = ?
    `);
    deactivateStmt.run(userId);

    // Активировать выбранную вариацию
    const activateStmt = db.prepare(`
      UPDATE hero_variations 
      SET is_active = 1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND user_id = ?
    `);
    activateStmt.run(heroVariationId, userId);

    return this.getHeroVariationById(heroVariationId);
  }

  /**
   * Удалить вариацию героя
   */
  deleteHeroVariation(id: number): boolean {
    const stmt = db.prepare(`
      DELETE FROM hero_variations 
      WHERE id = ?
    `);
    
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Получить описание героя для LLM (активная вариация или null)
   */
  getHeroProfileForLLM(userId: number): string | null {
    const heroVariation = this.getActiveHeroVariationByUserId(userId);
    if (!heroVariation) {
      return null;
    }
    
    // Форматируем профиль героя для использования в промптах
    const parts: string[] = [];
    parts.push(`Имя: ${heroVariation.name}`);
    if (heroVariation.description) {
      parts.push(`Описание: ${heroVariation.description}`);
    }
    
    return parts.join('\n');
  }
}

export const heroVariationRepository = new HeroVariationRepository();
