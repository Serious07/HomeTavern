import * as systemPromptRepository from '../repositories/system-prompt.repository';
import { SystemPrompt, CreateSystemPromptData, UpdateSystemPromptData } from '../repositories/system-prompt.repository';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export class SystemPromptServiceError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'SystemPromptServiceError';
  }
}

/**
 * Получить все системные промпты пользователя
 */
export function getAllSystemPrompts(userId: number): SystemPrompt[] {
  return systemPromptRepository.getSystemPromptsByUserId(userId);
}

/**
 * Получить системный промпт по ID
 */
export function getSystemPrompt(id: number, userId: number): SystemPrompt | null {
  const prompt = systemPromptRepository.getSystemPromptById(id);
  
  if (!prompt) {
    return null;
  }
  
  // Проверка на принадлежность пользователю
  if (prompt.user_id !== userId) {
    throw new SystemPromptServiceError('System prompt not found', 404);
  }
  
  return prompt;
}

/**
 * Получить активный системный промпт пользователя
 */
export function getActiveSystemPrompt(userId: number): SystemPrompt | null {
  return systemPromptRepository.getActiveSystemPrompt(userId);
}

/**
 * Создать системный промпт
 */
export function createSystemPrompt(userId: number, promptData: {
  name: string;
  description?: string | null;
  prompt_text: string;
  is_active?: number;
}): SystemPrompt {
  // Если пытаемся активировать промпт при создании, сначала деактивируем все остальные
  if (promptData.is_active === 1) {
    systemPromptRepository.deactivateAllUserPrompts(userId);
  }

  const data: CreateSystemPromptData = {
    user_id: userId,
    name: promptData.name,
    description: promptData.description || null,
    prompt_text: promptData.prompt_text,
    is_active: promptData.is_active || 0,
  };

  const id = systemPromptRepository.createSystemPrompt(userId, data);
  
  return systemPromptRepository.getSystemPromptById(id) as SystemPrompt;
}

/**
 * Обновить системный промпт
 */
export function updateSystemPrompt(id: number, userId: number, promptData: UpdateSystemPromptData): SystemPrompt {
  // Проверяем принадлежность промпта пользователю
  if (!systemPromptRepository.isPromptOwnedByUser(id, userId)) {
    throw new SystemPromptServiceError('System prompt not found', 404);
  }

  systemPromptRepository.updateSystemPrompt(id, promptData);
  
  return systemPromptRepository.getSystemPromptById(id) as SystemPrompt;
}

/**
 * Удалить системный промпт
 */
export function deleteSystemPrompt(id: number, userId: number): void {
  // Проверяем принадлежность промпта пользователю
  if (!systemPromptRepository.isPromptOwnedByUser(id, userId)) {
    throw new SystemPromptServiceError('System prompt not found', 404);
  }

  systemPromptRepository.deleteSystemPrompt(id);
}

/**
 * Активировать системный промпт
 */
export function activateSystemPrompt(id: number, userId: number): SystemPrompt {
  // Проверяем принадлежность промпта пользователю
  if (!systemPromptRepository.isPromptOwnedByUser(id, userId)) {
    throw new SystemPromptServiceError('System prompt not found', 404);
  }

  systemPromptRepository.activateSystemPrompt(id, userId);
  
  return systemPromptRepository.getSystemPromptById(id) as SystemPrompt;
}

/**
 * Деактивировать все промпты пользователя
 */
export function deactivateAllUserPrompts(userId: number): void {
  systemPromptRepository.deactivateAllUserPrompts(userId);
}

/**
 * Результат миграции
 */
export interface MigrationResult {
  migratedCount: number;
  errors: Array<{ characterId: number; characterName: string; error: string }>;
}

/**
 * Миграция system_prompt из таблицы characters в таблицу system_prompts
 *
 * ПРИМЕЧАНИЕ: Эта функция теперь возвращает пустой результат, так как
 * поле system_prompt было удалено из таблицы characters. Миграция может
 * быть выполнена только один раз при переходе на новую структуру данных.
 */
export function migrateSystemPrompts(userId: number): MigrationResult {
  const dbPath = path.join(__dirname, '..', '..', '..', 'hometavern.db');
  
  if (!fs.existsSync(dbPath)) {
    throw new SystemPromptServiceError('Database file not found', 500);
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  const result: MigrationResult = {
    migratedCount: 0,
    errors: [],
  };

  try {
    // Проверяем существует ли поле system_prompt в таблице characters
    const columns = db.prepare("PRAGMA table_info(characters)").all() as any[];
    const hasSystemPromptColumn = columns.some((col: any) => col.name === 'system_prompt');

    if (!hasSystemPromptColumn) {
      // Поле system_prompt не существует - миграция больше не нужна
      db.close();
      return result;
    }

    // Получаем персонажи пользователя с system_prompt
    const stmt = db.prepare(`
      SELECT id, name, system_prompt
      FROM characters
      WHERE user_id = ? AND system_prompt IS NOT NULL AND TRIM(system_prompt) != ''
    `);
    
    const characters = stmt.all(userId) as Array<{ id: number; name: string; system_prompt: string }>;

    if (characters.length === 0) {
      db.close();
      return result;
    }

    // Проверяем сколько промптов уже существует
    const countStmt = db.prepare(`
      SELECT COUNT(*) as count FROM system_prompts WHERE user_id = ?
    `);
    const existingCount = (countStmt.get(userId) as { count: number }).count;

    // Создаем промпты для каждого персонажа
    const insertStmt = db.prepare(`
      INSERT INTO system_prompts (user_id, name, description, prompt_text, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    for (let i = 0; i < characters.length; i++) {
      const char = characters[i];
      const isActive = existingCount === 0 && i === 0 ? 1 : 0;

      try {
        insertStmt.run(
          userId,
          `Миграция: ${char.name}`,
          `Перенесен из карточки персонажа ${char.name}`,
          char.system_prompt,
          isActive
        );
        result.migratedCount++;
      } catch (error) {
        result.errors.push({
          characterId: char.id,
          characterName: char.name,
          error: (error as Error).message,
        });
      }
    }

    // Устанавливаем is_active корректно: первый промпт активен, остальные нет
    db.prepare(`
      UPDATE system_prompts
      SET is_active = 0
      WHERE user_id = ?
    `).run(userId);

    db.prepare(`
      UPDATE system_prompts
      SET is_active = 1
      WHERE user_id = ? AND id = (
        SELECT id FROM system_prompts
        WHERE user_id = ?
        ORDER BY created_at ASC
        LIMIT 1
      )
    `).run(userId, userId);

  } finally {
    db.close();
  }

  return result;
}

// Экспорт объекта сервиса для совместимости с роутами
export const systemPromptService = {
  getAllSystemPrompts,
  getSystemPrompt,
  getActiveSystemPrompt,
  createSystemPrompt,
  updateSystemPrompt,
  deleteSystemPrompt,
  activateSystemPrompt,
  deactivateAllUserPrompts,
  migrateSystemPrompts,
};
